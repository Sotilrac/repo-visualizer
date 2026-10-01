# Entry point for everyday tasks. Each target wraps an npm script; CI calls the
# npm scripts directly, so this layer cannot break the pipeline.

NPM := npm

# What `make serve` listens on. BIND is every interface, so other machines
# on the network can open it.
PORT ?= 8080
BIND ?= 0.0.0.0

# Local settings, if you have made one. See .env.example. Values already in
# the environment win, so a one-off `make scan ROOT=...` still overrides it.
-include .env
export

.DEFAULT_GOAL := help
.PHONY: help install dev build preview serve check lint typecheck test test-watch coverage fix scan edit people analyze analyze-org all viz demo clean distclean

help: ## List the available targets
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "} {printf "  \033[1m%-12s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies exactly as the lockfile pins them
	$(NPM) ci

dev: ## Run the dev server on :5173
	$(NPM) run dev

build: ## Build the production bundle into dist/
	$(NPM) run build

preview: ## Serve the built bundle
	$(NPM) run preview

# For the machine that hosts this on the Dephy network. dist/data/people.json
# maps real email addresses to names, so keep this off any interface reachable
# from outside: `make serve BIND=127.0.0.1` for a private look.
serve: ## Serve dist/ to the network on :8080 (PORT, BIND override)
	@test -d dist || { echo "no dist/. Run make build, or copy one in"; exit 1; }
	@echo "http://$$(hostname -I | awk '{print $$1}'):$(PORT)"
	python3 -m http.server -d dist --bind $(BIND) $(PORT)

check: lint typecheck test ## Everything CI runs, minus the build

lint: ## Lint and check formatting
	$(NPM) run lint

typecheck: ## Type-check the JavaScript through JSDoc
	$(NPM) run typecheck

test: ## Run the test suite once
	$(NPM) run test:run

test-watch: ## Run the test suite in watch mode
	$(NPM) run test

coverage: ## Run the tests with a coverage report
	$(NPM) run coverage

fix: ## Apply formatting and safe lint fixes
	$(NPM) run fix

scan: ## Refresh the config from the clone tree (ROOT, OWNERS, SINCE from .env)
	@test -n "$(ROOT)" || { echo "set ROOT in .env, or make scan ROOT=~/src"; exit 1; }
	@test -n "$(CONFIG)$(REPO_VIZ_CONFIG)" || { echo "set REPO_VIZ_CONFIG in .env; keep it outside this repo"; exit 1; }
	$(NPM) run scan -- $(ROOT) $(if $(CONFIG),--config=$(CONFIG),) \
		$(if $(OWNERS),--owners=$(OWNERS),) $(if $(SINCE),--since=$(SINCE),) $(ARGS)

edit: ## Open the config editor
	@test -n "$(CONFIG)$(REPO_VIZ_CONFIG)" || { echo "set REPO_VIZ_CONFIG in .env, or make edit CONFIG=..."; exit 1; }
	REPO_VIZ_CONFIG=$(if $(CONFIG),$(abspath $(CONFIG)),$(REPO_VIZ_CONFIG)) $(NPM) run edit

people: ## Export the config's people and avatars for the app to draw
	@test -n "$(CONFIG)$(REPO_VIZ_CONFIG)" || { echo "set REPO_VIZ_CONFIG in .env, or make people CONFIG=..."; exit 1; }
	$(NPM) run people -- $(if $(CONFIG),--config=$(CONFIG),)

analyze: ## Analyze one repository (REPO from .env)
	@test -n "$(REPO)" || { echo "set REPO in .env, or make analyze REPO=../some-repo"; exit 1; }
	$(NPM) run analyze -- $(REPO) $(ARGS)

analyze-org: ## Analyze every repo the config does not hide, into one dataset
	@test -n "$(CONFIG)$(REPO_VIZ_CONFIG)" || { echo "set REPO_VIZ_CONFIG in .env"; exit 1; }
	@test -n "$(ROOT)" || { echo "set ROOT in .env, or make analyze-org ROOT=~/src"; exit 1; }
	$(NPM) run analyze-org -- --root=$(ROOT) $(if $(CONFIG),--config=$(CONFIG),) $(ARGS)

all: ## Everything end to end: scan, export people, analyze every repo, open it
	$(MAKE) scan
	$(MAKE) people
	$(MAKE) analyze-org
	$(NPM) run dev

viz: ## Analyze one repo, export the config's people, and open it (REPO from .env)
	@test -n "$(REPO)" || { echo "set REPO in .env, or make viz REPO=~/src/thing"; exit 1; }
	$(MAKE) analyze REPO=$(REPO)
	$(MAKE) people $(if $(CONFIG),CONFIG=$(CONFIG),)
	$(NPM) run dev

demo: ## Regenerate the bundled demo dataset
	$(NPM) run make-demo

clean: ## Remove build output and caches
	rm -rf dist coverage .vite

distclean: clean ## Also remove installed dependencies
	rm -rf node_modules
