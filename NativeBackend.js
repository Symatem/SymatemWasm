const indexByName = {
    'EAV': 0, 'AVE': 1, 'VEA': 2,
    'EVA': 3, 'AEV': 4, 'VAE': 5
};

const triplePrioritized = [
    [0, 1, 2, 0, 1, 2],
    [1, 2, 0, 2, 0, 1],
    [2, 0, 1, 1, 2, 0]
];

const tripleNormalized = [
    [0, 2, 1, 0, 1, 2],
    [1, 0, 2, 2, 0, 1],
    [2, 1, 0, 1, 2, 0]
];

function reorderTriple(order, index, triple) {
    return [triple[order[0][index]], triple[order[1][index]], triple[order[2][index]]];
}

function* searchMMM(index, triple) {
    const handle = this.getHandle(triple[0]);
    if(!handle)
        return 0;
    const subIndex = handle.subIndices[index],
          set = subIndex[triple[1]];
    if(!set || !set[triple[2]])
        return 0;
    yield reorderTriple(tripleNormalized, index, triple);
    return 1;
}

function* searchMMI(index, triple) {
    const handle = this.getHandle(triple[0]);
    if(!handle)
        return 0;
    const subIndex = handle.subIndices[index],
          set = subIndex[triple[1]];
    if(!set)
        return 0;
    yield reorderTriple(tripleNormalized, index, triple);
    return 1;
}

function* searchMII(index, triple) {
    const handle = this.getHandle(triple[0]);
    if(!handle)
        return 0;
    yield reorderTriple(tripleNormalized, index, triple);
    return 1;
}

function* searchIII(index, triple) {
    for(const namespaceIdentity in this.namespaces)
        for(const alphaIdentity in this.namespaces[namespaceIdentity].handles) {
            const subIndex = this.namespaces[namespaceIdentity].handles[alphaIdentity].subIndices[index];
            if(Object.keys(subIndex).length == 0)
                continue;
            yield reorderTriple(tripleNormalized, index, triple);
            return 1;
        }
    return 0;
}

function* searchMMV(index, triple) {
    const handle = this.getHandle(triple[0]);
    if(!handle)
        return 0;
    const subIndex = handle.subIndices[index],
          set = subIndex[triple[1]];
    if(!set)
        return 0;
    let count = 0;
    for(triple[2] in set) {
        yield reorderTriple(tripleNormalized, index, triple);
        ++count;
    }
    return count;
}

function* searchMVV(index, triple) {
    const handle = this.getHandle(triple[0]);
    if(!handle)
        return 0;
    const subIndex = handle.subIndices[index];
    let count = 0;
    for(triple[1] in subIndex) {
        const set = subIndex[triple[1]];
        for(triple[2] in set) {
            yield reorderTriple(tripleNormalized, index, triple);
            ++count;
        }
    }
    return count;
}

function* searchMIV(index, triple) {
    const handle = this.getHandle(triple[0]);
    if(!handle)
        return 0;
    const subIndex = handle.subIndices[index],
          results = {};
    for(const beta in subIndex)
        for(const result of subIndex[beta])
            results[result] = true;
    let count = 0;
    for(triple[2] in results) {
        yield reorderTriple(tripleNormalized, index, triple);
        ++count;
    }
    return count;
}

function* searchMVI(index, triple) {
    const handle = this.getHandle(triple[0]);
    if(!handle)
        return 0;
    const subIndex = handle.subIndices[index];
    let count = 0;
    for(triple[1] in subIndex) {
        yield reorderTriple(tripleNormalized, index, triple);
        ++count;
    }
    return count;
}

function* searchVII(index, triple) {
    let count = 0;
    for(const namespaceIdentity in this.namespaces)
        for(const alphaIdentity in this.namespaces[namespaceIdentity].handles) {
            const subIndex = this.namespaces[namespaceIdentity].handles[alphaIdentity].subIndices[index];
            if(Object.keys(subIndex).length == 0)
                continue;
            triple[0] = this.constructor.concatIntoSymbol(namespaceIdentity, alphaIdentity);
            yield reorderTriple(tripleNormalized, index, triple);
            ++count;
        }
    return count;
}

function* searchVVI(index, triple) {
    let count = 0;
    for(const namespaceIdentity in this.namespaces)
        for(const alphaIdentity in this.namespaces[namespaceIdentity].handles) {
            const subIndex = this.namespaces[namespaceIdentity].handles[alphaIdentity].subIndices[index];
            triple[0] = this.constructor.concatIntoSymbol(namespaceIdentity, alphaIdentity);
            for(triple[1] in subIndex) {
                yield reorderTriple(tripleNormalized, index, triple);
                ++count;
            }
        }
    return count;
}

function* searchVVV(index, triple) {
    let count = 0;
    for(const namespaceIdentity in this.namespaces)
        for(const alphaIdentity in this.namespaces[namespaceIdentity].handles) {
            const subIndex = this.namespaces[namespaceIdentity].handles[alphaIdentity].subIndices[index];
            triple[0] = this.constructor.concatIntoSymbol(namespaceIdentity, alphaIdentity);
            for(triple[1] in subIndex) {
                const set = subIndex[triple[1]];
                for(triple[2] in set) {
                    yield reorderTriple(tripleNormalized, index, triple);
                    ++count;
                }
            }
        }
    return count;
}

const indexLookup = [
    indexByName.EAV, indexByName.AVE, indexByName.AVE,
    indexByName.VEA, indexByName.VEA, indexByName.VAE,
    indexByName.VEA, indexByName.VEA, indexByName.VEA,
    indexByName.EAV, indexByName.AVE, indexByName.AVE,
    indexByName.EAV, indexByName.EAV, indexByName.AVE,
    indexByName.EVA, indexByName.VEA, indexByName.VEA,
    indexByName.EAV, indexByName.AEV, indexByName.AVE,
    indexByName.EAV, indexByName.EAV, indexByName.AVE,
    indexByName.EAV, indexByName.EAV, indexByName.EAV
];

const searchLookup = [
    searchMMM, searchMMV, searchMMI,
    searchMMV, searchMVV, searchMVI,
    searchMMI, searchMVI, searchMII,
    searchMMV, searchMVV, searchMVI,
    searchMVV, searchVVV, searchVVI,
    searchMVI, searchVVI, searchVII,
    searchMMI, searchMVI, searchMII,
    searchMVI, searchVVI, searchVII,
    searchMII, searchVII, searchIII
];

function bitwiseCopy(destination, destinationOffset, source, sourceOffset, length) {
    if(length == 0)
        return;
    if(destinationOffset%8 == 0 && sourceOffset%8 == 0 && length%8 == 0) {
        destination.set(source.subarray(sourceOffset/8, (sourceOffset+length)/8), destinationOffset/8);
        return;
    }
    if(destination == source && sourceOffset < destinationOffset && sourceOffset+length > destinationOffset)
        console.error('bitwiseCopy with destination == source is not implemented yet'); // TODO
    const elementLength = 32;
    destination = new DataView(destination.buffer);
    source = new DataView(source.buffer);
    let sourceIndex = Math.floor(sourceOffset/elementLength)*elementLength/8,
        destinationIndex = Math.floor(destinationOffset/elementLength)*elementLength/8;
    const sourceShift = sourceOffset%elementLength,
          destinationShift = destinationOffset%elementLength;
    while(true) {
        const mask = (length < elementLength) ? ~((-1)<<length) : -1,
              nextSourceIndex = sourceIndex+elementLength/8,
              nextDestinationIndex = destinationIndex+elementLength/8;
        let element = source.getUint32(sourceIndex, true)>>>sourceShift;
        if(nextSourceIndex < source.byteLength && sourceShift > 0)
            element |= source.getUint32(nextSourceIndex, true)<<(elementLength-sourceShift);
        element &= mask;
        destination.setUint32(destinationIndex, destination.getUint32(destinationIndex, true)&(~(mask<<destinationShift))|(element<<destinationShift), true);
        if(nextDestinationIndex < destination.byteLength && destinationShift > 0)
            destination.setUint32(nextDestinationIndex, destination.getUint32(nextDestinationIndex, true)&(~(mask>>>(elementLength-destinationShift)))|(element>>>(elementLength-destinationShift)), true);
        length -= elementLength;
        if(length <= 0)
            break;
        sourceIndex = nextSourceIndex;
        destinationIndex = nextDestinationIndex;
    }
}

import BasicBackend from './BasicBackend.js';
export default class NativeBackend extends BasicBackend {
    constructor() {
        super();
        this.namespaces = {};
    }

    getHandle(symbol) {
        const namespace = this.namespaces[this.constructor.namespaceOfSymbol(symbol)];
        return (namespace) ? namespace.handles[this.constructor.identityOfSymbol(symbol)] : undefined;
    }

    manifestNamespace(namespaceIdentity) {
        let namespace = this.namespaces[namespaceIdentity];
        if(!namespace) {
            namespace = {
                // 'identity': namespaceIdentity,
                'nextIdentity': 0,
                'freeIdentities': {},
                'handles': {}
            };
            this.namespaces[namespaceIdentity] = namespace;
        }
        return namespace;
    }

    /**
     * Reserves the identity of a symbol in its namespace
     * @param {Symbol} symbol
     * @return {Symbol} symbol
     */
    manifestSymbol(symbol) {
        const namespaceIdentity = this.constructor.namespaceOfSymbol(symbol),
              namespace = this.manifestNamespace(namespaceIdentity),
              identity = this.constructor.identityOfSymbol(symbol);
        if(namespace.handles[identity])
            return symbol;
        delete namespace.freeIdentities[identity];
        while(namespace.nextIdentity < identity)
            namespace.freeIdentities[namespace.nextIdentity++] = true;
        namespace.nextIdentity = Math.max(namespace.nextIdentity, identity+1);
        const handle = namespace.handles[identity] = {
            // namespace: namespace,
            // identity: identity,
            dataLength: 0,
            dataBytes: new Uint8Array(),
            subIndices: []
        };
        for(let i = 0; i < 6; ++i)
            handle.subIndices.push({});
        return symbol;
    }

    /**
     * Creates a new symbol
     * @param {number} namespaceIdentity Identity of the namespace to create the symbol in
     * @return {Symbol} symbol
     */
    createSymbol(namespaceIdentity) {
        const namespace = this.manifestNamespace(namespaceIdentity);
        let identity;
        if(Object.keys(namespace.freeIdentities).length == 0)
            identity = namespace.nextIdentity++;
        else {
            identity = Object.keys(namespace.freeIdentities)[0];
            delete namespace.freeIdentities[identity];
        }
        return this.manifestSymbol(this.constructor.concatIntoSymbol(namespaceIdentity, identity));
    }

    /**
     * Releases the identity of a symbol in its namespace
     * @param {Symbol} symbol
     */
    releaseSymbol(symbol) {
        const namespaceIdentity = this.constructor.namespaceOfSymbol(symbol),
              namespace = this.namespaces[namespaceIdentity],
              identity = this.constructor.identityOfSymbol(symbol);
        delete namespace.handles[identity];
        if(Object.keys(namespace.handles).length == 0)
            delete this.namespaces[namespaceIdentity];
        else {
            if(identity == namespace.nextIdentity - 1)
                --namespace.nextIdentity;
            else if(identity < namespace.nextIdentity - 1)
                namespace.freeIdentities[identity] = true;
        }
    }



    /**
     * Returns the length of the symbols virtual space
     * @param {Symbol} symbol
     * @return {number} length in bits
     */
    getLength(symbol) {
        const handle = this.getHandle(symbol);
        return (handle) ? handle.dataLength : 0;
    }

    /**
     * Inserts or erases a slice of a symbols virtual space at the given offset and with the given length
     * @param {Symbol} symbol
     * @param {number} offset in bits
     * @param {number} length in bits (positive=insert, negative=erase)
     */
    creaseLength(symbol, offset, length) {
        const handle = this.getHandle(symbol),
              newDataBytes = new Uint8Array(Math.ceil((handle.dataLength+length)/32)*4);
        if(length < 0)
            console.assert(offset-length <= handle.dataLength);
        else
            console.assert(offset <= handle.dataLength);
        newDataBytes.set(handle.dataBytes.subarray(0, Math.ceil(offset/8)), 0);
        if(offset%8 == 0 && length%8 == 0 && handle.dataLength%8 == 0) {
            if(length < 0)
                newDataBytes.set(handle.dataBytes.subarray((offset-length)/8, handle.dataLength/8), offset/8);
            else
                newDataBytes.set(handle.dataBytes.subarray(offset/8, handle.dataLength/8), (offset+length)/8);
        } else {
            if(length < 0)
                bitwiseCopy(newDataBytes, offset, handle.dataBytes, offset-length, handle.dataLength-offset+length);
            else {
                newDataBytes[Math.floor(offset/8)] &= ~((-1)<<(offset%8));
                bitwiseCopy(newDataBytes, offset+length, handle.dataBytes, offset, handle.dataLength-offset);
            }
        }
        handle.dataLength += length;
        handle.dataBytes = newDataBytes;
    }

    /**
     * Returns a slice of data starting at the given offset and with the given length
     * @param {Symbol} symbol
     * @param {number} offset in bits
     * @param {number} length in bits
     * @return {Uint8Array} dataSlice Do not modify the return value as it might be used internally
     */
    readData(symbol, offset, length) {
        const handle = this.getHandle(symbol);
        console.assert(offset+length <= handle.dataLength);
        if(offset%8 == 0 && length%8 == 0)
            return (offset == 0 && length == handle.dataLength)
                   ? handle.dataBytes
                   : handle.dataBytes.subarray(offset/8, (offset+length)/8);
        const dataBytes = new Uint8Array(Math.ceil(length/32)*4);
        bitwiseCopy(dataBytes, 0, handle.dataBytes, offset, length);
        return dataBytes;
    }

    /**
     * Replaces a slice of data starting at the given offset and with the given length by dataBytes
     * @param {Symbol} symbol
     * @param {number} offset in bits
     * @param {number} length in bits
     * @param {Uint8Array} dataBytes
     */
    writeData(symbol, offset, length, dataBytes) {
        const handle = this.getHandle(symbol);
        console.assert(offset+length <= handle.dataLength);
        if(offset == 0 && length == handle.dataLength) {
            handle.dataBytes = dataBytes;
            handle.dataLength = length;
        } else if(offset%8 == 0 && length%8 == 0)
            handle.dataBytes.set(dataBytes.subarray(0, length/8), offset/8);
        else {
            console.assert(dataBytes.byteLength%4 == 0);
            bitwiseCopy(handle.dataBytes, offset, dataBytes, 0, length);
        }
    }

    /**
     * Replaces a slice of a symbols data by another symbols data
     * @param {Symbol} dstOffset
     * @param {number} dstOffset in bits
     * @param {Symbol} srcSymbol
     * @param {number} srcOffset in bits
     * @param {number} length in bits
     */
    replaceData(dstSymbol, dstOffset, srcSymbol, srcOffset, length) {
        const dstHandle = this.getHandle(dstSymbol),
              srcHandle = this.getHandle(srcSymbol);
        console.assert(dstOffset+length <= dstHandle.dataLength && srcOffset+length <= srcHandle.dataLength);
        if(dstOffset%8 == 0 && srcOffset%8 == 0 && length%8 == 0)
            dstHandle.dataBytes.set(srcHandle.dataBytes.subarray(srcOffset/8, (srcOffset+length)/8), dstOffset/8);
        else
            bitwiseCopy(dstHandle.dataBytes, dstOffset, srcHandle.dataBytes, srcOffset, length);
    }



    /**
     * Links or unlinks a triple
     * @param {Triple} triple
     * @param {boolean} linked
     * @return {boolean} success Returns false if no changes were made
     */
    setTriple(triple, linked) {
        function operateSubIndex(subIndex, beta, gamma) {
            if(linked) {
                let set;
                if(!subIndex[beta]) {
                    set = {};
                    subIndex[beta] = set;
                } else {
                    set = subIndex[beta];
                    if(set[gamma])
                        return false;
                }
                set[gamma] = true;
            } else {
                const set = subIndex[beta];
                if(!set || !set[gamma])
                    return false;
                delete set[gamma];
                if(Object.keys(set).length === 0)
                    delete subIndex[beta];
            }
            return true;
        }
        if(linked) {
            this.manifestSymbol(triple[0]);
            this.manifestSymbol(triple[1]);
            this.manifestSymbol(triple[2]);
        }
        const entityHandle = this.getHandle(triple[0]),
              attributeHandle = this.getHandle(triple[1]),
              valueHandle = this.getHandle(triple[2]);
        if(!linked && !(entityHandle && attributeHandle && valueHandle))
            return true;
        operateSubIndex(entityHandle.subIndices[indexByName.EAV], triple[1], triple[2]);
        operateSubIndex(attributeHandle.subIndices[indexByName.AVE], triple[2], triple[0]);
        operateSubIndex(valueHandle.subIndices[indexByName.VEA], triple[0], triple[1]);
        operateSubIndex(entityHandle.subIndices[indexByName.EVA], triple[2], triple[1]);
        operateSubIndex(attributeHandle.subIndices[indexByName.AEV], triple[0], triple[2]);
        return operateSubIndex(valueHandle.subIndices[indexByName.VAE], triple[1], triple[0]);
    }

    /**
     * Yields all matching triples according to the given triple and mask. The final .next() returns the count of matches
     * @param {QueryMask} mask
     * @param {Triple} triple
     * @return {Triple} iterator of matches
     */
    queryTriples(mask, triple) {
        const index = indexLookup[mask];
        return searchLookup[mask].call(this, index, reorderTriple(triplePrioritized, index, triple));
    }
};
