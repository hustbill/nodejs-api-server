SRC_DIR=.
BUILD_DIR=./build
MODULES_DIR=$(SRC_DIR)/node_modules

JSLINT=$(MODULES_DIR)/jslint/bin/jslint.js
JSLINT_OPTIONS=--sloppy --stupid --node --color

JSHINT=$(MODULES_DIR)/jshint/bin/jshint

.PHONY: all restore test lint clean

# Default targets
all: test lint

$(BUILD_DIR):
	mkdir $(BUILD_DIR)

clean:
	-rm -rf $(BUILD_DIR)

restore: package.json
	npm install

test: restore runtests

runtests :
	./node_modules/mocha/bin/mocha -R spec -t 60000 ./test/spec/*

lint: 
	find . -name "*.js" -not -regex "\./node_modules.*" -not -regex "\./lib/soap.*" -not -regex "\./test.*" -print0 | xargs -0 $(JSLINT) $(JSLINT_OPTIONS)

hint:
	$(JSHINT) *

install: test lint
	sudo cp ./upstart/pulse.conf /etc/init/
	sudo cp ./logrotate/pulse /etc/logrotate.d/


