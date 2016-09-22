ifdef GREP
	GREPARG = -g $(GREP)
endif

REPORTER ?= spec
TESTS = ./test
NPM_BIN = ./node_modules/.bin

jshint:
	$(NPM_BIN)/jshint index.js test

fixjsstyle:
	fixjsstyle -r lib -r test --strict --jslint_error=all

test: jshint
	$(NPM_BIN)/mocha --globals setImmediate,clearImmediate --recursive --check-leaks --colors -t 10000 --reporter $(REPORTER) $(TESTS) $(GREPARG)

.PHONY: jshint fixjsstyle test
