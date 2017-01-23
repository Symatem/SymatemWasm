/* jslint node: true, esnext: true */
/* global WebAssembly */
'use strict';

function uint8ArrayToString(array) {
    return String.fromCharCode.apply(null, array);
}

module.exports = function(code) {
    return WebAssembly.compile(code).then(function(result) {
        this.wasmModule = result;
        for(const key in this.env)
            this.env[key] = this.env[key].bind(this);
        this.wasmInstance = new WebAssembly.Instance(this.wasmModule, { 'env': this.env });
        this.superPageByteAddress = this.wasmInstance.exports.memory.buffer.byteLength;
        this.wasmInstance.exports.memory.grow(1);
        return this;
    }.bind(this), function(error) {
        console.log(error);
    });
};

module.exports.prototype.initializerFunction = '_GLOBAL__sub_I_';
module.exports.prototype.chunkSize = 65536;
module.exports.prototype.blobBufferSize = 4096;
module.exports.prototype.symbolByName = {
    BlobType: 13,
    Natural: 14,
    Integer: 15,
    Float: 16,
    UTF8: 17
};

module.exports.prototype.env = {
    'consoleLogString': function(basePtr, length) {
        console.log(uint8ArrayToString(this.getMemorySlice(basePtr, length)));
    },
    'consoleLogInteger': function(value) {
        console.log(value);
    },
    'consoleLogFloat': function(value) {
        console.log(value);
    }
};

module.exports.prototype.getMemorySlice = function(begin, length) {
    return new Uint8Array(this.wasmInstance.exports.memory.buffer.slice(begin, begin+length));
};

module.exports.prototype.setMemorySlice = function(begin, slice) {
    new Uint8Array(this.wasmInstance.exports.memory.buffer).set(slice, begin);
};

module.exports.prototype.call = function(name, ...params) {
    try {
        return this.wasmInstance.exports[name](...params);
    } catch(error) {
        console.log(name, ...params, error);
    }
};

module.exports.prototype.saveImage = function() {
    this.call('saveImage');
    return this.wasmInstance.exports.memory.buffer.slice(this.superPageByteAddress);
};

module.exports.prototype.loadImage = function(image) {
    const currentSize = this.wasmInstance.exports.memory.buffer.byteLength,
          newSize = this.superPageByteAddress+image.byteLength;
    if(currentSize < newSize)
        this.wasmInstance.exports.memory.grow(Math.ceil((newSize-currentSize)/this.chunkSize));
    this.setMemorySlice(this.superPageByteAddress, image);
};

module.exports.prototype.resetImage = function() {
    this.setMemorySlice(this.superPageByteAddress, new Uint8Array(this.chunkSize));
    this.call(this.initializerFunction+'WASM.cpp');
};

module.exports.prototype.readSymbolBlob = function(symbol) {
    const buffer = this.readBlob(symbol).buffer;
    return Array.prototype.slice.call(new Uint32Array(buffer));
};

module.exports.prototype.readBlob = function(symbol, offset, length) {
    if(!offset)
        offset = 0;
    if(!length)
        length = this.getBlobSize(symbol)-offset;
    if(length < 0)
        return;
    let sliceOffset = 0;
    const bufferByteAddress = this.call('getStackPointer')-this.blobBufferSize,
          data = new Uint8Array(Math.ceil(length/8));
    while(length > 0) {
        const sliceLength = Math.min(length, this.blobBufferSize*8);
        this.call('readBlob', symbol, offset+sliceOffset*8, sliceLength);
        const bufferSlice = this.getMemorySlice(bufferByteAddress, Math.ceil(sliceLength/8));
        data.set(bufferSlice, sliceOffset);
        length -= sliceLength;
        sliceOffset += Math.ceil(sliceLength/8);
    }
    return data;
};

module.exports.prototype.writeBlob = function(symbol, data, offset) {
    const bufferByteAddress = this.call('getStackPointer')-this.blobBufferSize,
          oldLength = this.getBlobSize(symbol);
    let newLength = (data === undefined) ? 0 : data.length*8, sliceOffset = 0;
    if(!offset) {
        offset = 0;
        this.setBlobSize(symbol, newLength);
    } else if(newLength+offset > oldLength)
        return false;
    while(newLength > 0) {
        const sliceLength = Math.min(newLength, this.blobBufferSize*8),
              bufferSlice = new Uint8Array(data.slice(sliceOffset, sliceOffset+Math.ceil(sliceLength/8)));
        this.setMemorySlice(bufferByteAddress, bufferSlice);
        this.call('writeBlob', symbol, offset+sliceOffset*8, sliceLength);
        newLength -= sliceLength;
        sliceOffset += Math.ceil(sliceLength/8);
    }
    return true;
};

module.exports.prototype.getBlobSize = function(symbol) {
    return this.call('getBlobSize', symbol);
};

module.exports.prototype.setBlobSize = function(symbol, size) {
    this.call('setBlobSize', symbol, size);
};

module.exports.prototype.getBlobType = function(symbol) {
    const result = this.queryArray(this.queryMask.MMV, symbol, this.symbolByName.BlobType, 0);
    return (result.length === 1) ? result[0] : 0;
};

module.exports.prototype.getBlob = function(symbol) {
    const type = this.getBlobType(symbol);
    const blob = this.readBlob(symbol),
          dataView = new DataView(blob.buffer);
    if(blob.length === 0)
        return;
    switch(type) {
        case this.symbolByName.Natural:
            return dataView.getUint32(0, true);
        case this.symbolByName.Integer:
            return dataView.getInt32(0, true);
        case this.symbolByName.Float:
            return dataView.getFloat32(0, true);
        case this.symbolByName.UTF8:
            return uint8ArrayToString(blob);
    }
    return blob;
};

module.exports.prototype.setBlob = function(symbol, data) {
    let type = 0, buffer = data;
    switch(typeof data) {
        case 'string':
            buffer = new Uint8Array(data.length);
            for(let i = 0; i < data.length; ++i)
                buffer[i] = data[i].charCodeAt(0);
            type = this.symbolByName.UTF8;
            break;
        case 'number':
            buffer = new Uint8Array(4);
            const view = new DataView(buffer.buffer);
            if(!Number.isInteger(data)) {
                view.setFloat32(0, data, true);
                type = this.symbolByName.Float;
            } else if(data < 0) {
                view.setInt32(0, data, true);
                type = this.symbolByName.Integer;
            } else {
                view.setUint32(0, data, true);
                type = this.symbolByName.Natural;
            }
            break;
    }
    if(!this.writeBlob(symbol, buffer))
        return false;
    this.setSolitary(symbol, this.symbolByName.BlobType, type);
    return true;
};

module.exports.prototype.deserializeHRL = function(inputString, packageSymbol = 0) {
    const inputSymbol = this.createSymbol(), outputSymbol = this.createSymbol();
    this.setBlob(inputSymbol, inputString);
    const exception = this.call('deserializeHRL', inputSymbol, outputSymbol, packageSymbol);
    const result = this.readSymbolBlob(outputSymbol);
    this.unlinkSymbol(inputSymbol);
    this.unlinkSymbol(outputSymbol);
    return (exception) ? exception : result;
};

module.exports.prototype.deserializeBlob = function(string) {
    if(string.length > 2 && string[0] == '"' && string[string.length-1] == '"')
        return string.substr(1, string.length-2);
    else if(string.length > 4 && string.substr(0, 4) == 'hex:') {
        let blob = new Uint8Array(Math.floor((string.length-4)/2));
        for(let i = 0; i < blob.length; ++i)
            blob[i] = parseInt(string[i*2+4], 16)|(parseInt(string[i*2+5], 16)<<4);
        return blob;
    } else if(!Number.isNaN(parseFloat(string)))
        return parseFloat(string);
    else if(!Number.isNaN(parseInt(string)))
        return parseInt(string);
};

module.exports.prototype.serializeBlob = function(symbol) {
    const blob = this.getBlob(symbol);
    switch(typeof blob) {
        case 'undefined':
            return '#'+symbol;
        case 'string':
            return '"'+blob+'"';
        case 'object':
            let string = '';
            for(let i = 0; i < blob.length; ++i) {
                const byte = blob[i];
                string += (byte&0xF).toString(16)+(byte>>4).toString(16);
            }
            return 'hex:'+string.toUpperCase();
        default:
            return ''+blob;
    }
};

module.exports.prototype.linkTriple = function(entity, attribute, value) {
    this.call('link', entity, attribute, value);
    if(this.linkedTriple)
        this.linkedTriple(entity, attribute, value);
};

module.exports.prototype.unlinkTriple = function(entity, attribute, value) {
    this.call('unlink', entity, attribute, value);
    const referenceCount =
        this.queryCount(this.queryMask.MVV, entity, 0, 0)+
        this.queryCount(this.queryMask.VMV, 0, entity, 0)+
        this.queryCount(this.queryMask.VVM, 0, 0, entity);
    if(referenceCount == 0)
        this.releaseSymbol(entity);
    if(this.unlinkedTriple)
        this.unlinkedTriple(entity, attribute, value);
};

module.exports.prototype.setSolitary = function(entity, attribute, newValue) {
    const result = this.queryArray(this.queryMask.MMV, entity, attribute, 0);
    let needsToBeLinked = true;
    for(const oldValue of result)
        if(oldValue == newValue)
            needsToBeLinked = false;
        else
            this.unlinkTriple(entity, attribute, oldValue);
    if(needsToBeLinked)
        this.linkTriple(entity, attribute, newValue);
};

module.exports.prototype.createSymbol = function() {
    return this.call('_createSymbol');
};

module.exports.prototype.releaseSymbol = function(symbol) {
    this.call('_releaseSymbol', symbol);
    if(this.releasedSymbol)
        this.releasedSymbol(symbol);
};

module.exports.prototype.unlinkSymbol = function(symbol) {
    let pairs = this.queryArray(this.queryMask.MVV, symbol, 0, 0);
    for(let i = 0; i < pairs.length; i += 2)
        this.unlinkTriple(symbol, pairs[i], pairs[i+1]);
    pairs = this.queryArray(this.queryMask.VMV, 0, symbol, 0);
    for(let i = 0; i < pairs.length; i += 2)
        this.unlinkTriple(pairs[i], symbol, pairs[i+1]);
    pairs = this.queryArray(this.queryMask.VVM, 0, 0, symbol);
    for(let i = 0; i < pairs.length; i += 2)
        this.unlinkTriple(pairs[i], pairs[i+1], symbol);
    this.releaseSymbol(symbol);
};

module.exports.prototype.queryMode = ['M', 'V', 'I'];
module.exports.prototype.queryMask = {};
for(let i = 0; i < 27; ++i)
    module.exports.prototype.queryMask[module.exports.prototype.queryMode[i%3] + module.exports.prototype.queryMode[Math.floor(i/3)%3] + module.exports.prototype.queryMode[Math.floor(i/9)%3]] = i;

module.exports.prototype.queryArray = function(mask, entity, attribute, value) {
    const resultSymbol = this.createSymbol();
    this.call('query', mask, entity, attribute, value, resultSymbol);
    const result = this.readSymbolBlob(resultSymbol);
    this.releaseSymbol(resultSymbol);
    return result;
};

module.exports.prototype.queryCount = function(mask, entity, attribute, value) {
    return this.call('query', mask, entity, attribute, value, 0);
};