# Entry point for everyday tasks. Each target wraps an npm script; CI calls the
# npm scripts directly, so this layer cannot break the pipeline.

NPM := npm

.DEFAULT_GOAL := help
.PHONY: help install dev build preview check lint typecheck test test-watch coverage fix analyze demo clean distclean

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

analyze: ## Analyze a repository: make analyze REPO=../some-repo
	@test -n "$(REPO)" || { echo "set REPO, e.g. make analyze REPO=../some-repo"; exit 1; }
	$(NPM) run analyze -- $(REPO) $(ARGS)

demo: ## Regenerate the bundled demo dataset
	$(NPM) run make-demo

clean: ## Remove build output and caches
	rm -rf dist coverage .vite

distclean: clean ## Also remove installed dependencies
	rm -rf node_modules
