/* global describe, it, xit, before, after */
/* jslint node: true, esnext: true */
'use strict';

const chai = require('chai'),
  assert = chai.assert,
  expect = chai.expect,
  should = chai.should(),
  path = require('path'),
  fs = require('fs'),
  {
    Symatem
  } = require('../dist/main');

const aFile = path.join(__dirname, '..', 'Symatem.wasm');

console.log(aFile);

const a = new Uint8Array(fs.readFileSync(aFile));

const sym = new Symatem(a);

sym.initialize(a);