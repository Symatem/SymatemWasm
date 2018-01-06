const queryMode = ['M', 'V', 'I'],
      queryMask = {};
for(let i = 0; i < 27; ++i)
    queryMask[queryMode[i % 3] + queryMode[Math.floor(i / 3) % 3] + queryMode[Math.floor(i / 9) % 3]] = i;

const symbolByName = {
    'Void': 0,
    'Symbol': 0,
    'Entity': 0,
    'Attribute': 0,
    'Value': 0,

    'Type': 0,
    'Encoding': 0,
    'BinaryNumber': 0,
    'TwosComplement': 0,
    'IEEE754': 0,
    'UTF8': 0,
    'Composite': 0,
    'Default': 0,
    'SlotSize': 0,
    'Count': 0,
    'Dynamic': 0,

    'Basics': 2,
    'Index': 2,
    'Namespaces': 2,
};

/**
 * @typedef {Object} Symbol
 * @property {number} namespaceIdentity
 * @property {number} identity
 */

/**
 * @typedef {Object} Triple
 * @property {Symbol} entity
 * @property {Symbol} attribute
 * @property {Symbol} value
 */

export default class BasicBackend {
    static get queryMask() {
        return queryMask;
    }

    static get symbolByName() {
        return symbolByName;
    }

    /**
     * Saves dataBytes as download file in browsers
     * @param {Uint8Array} dataBytes
     * @param {string} fileName
     */
    static downloadAsFile(dataBytes, fileName) {
        const file = new Blob([dataBytes], {type: 'octet/stream'}),
              url = URL.createObjectURL(file),
              a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Converts UTF8 encoded Uint8Array to text
     * @param {Uint8Array} utf8
     * @return {string} text
     */
    static utf8ArrayToText(utf8) {
        // return new TextDecoder('utf8').decode(utf8);
        let uri = '';
        for(const byte of new Uint8Array(utf8)) {
            const hex = byte.toString(16);
            uri += '%' + ((hex.length == 1) ? '0' + hex : hex);
        }
        try {
            return decodeURIComponent(uri);
        } catch(error) {
            return utf8;
        }
    }

    /**
     * Converts text to UTF8 encoded Uint8Array
     * @param {string} text
     * @return {Uint8Array} utf8
     */
    static textToUtf8Array(text) {
        // return new TextEncoder('utf8').encode(text);
        const uri = encodeURI(text),
              dataBytes = [];
        for(let i = 0; i < uri.length; ++i) {
            if(uri[i] == '%') {
                dataBytes.push(parseInt(uri.substr(i + 1, 2), 16));
                i += 2;
            } else
                dataBytes.push(uri.charCodeAt(i));
        }
        return new Uint8Array(dataBytes);
    }

    /**
     * Converts JS native data types to text
     * @param {Object} dataValue
     * @return {string} text
     */
    static encodeText(dataValue) {
        switch(typeof dataValue) {
            case 'string':
                return '"' + dataValue + '"';
            case 'object':
                if(dataValue instanceof Array)
                    return '['+dataValue.map(value => this.encodeText(value)).join(', ')+']';
                let string = '';
                for(let i = 0; i < dataValue.byteLength; ++i) {
                    const byte = dataValue[i];
                    string += (byte & 0xF).toString(16) + (byte >> 4).toString(16);
                }
                return 'hex:' + string.toUpperCase();
            default:
                return '' + dataValue;
        }
    }

    /**
     * Converts text to JS native data types
     * @param {string} text
     * @return {Object} dataValue
     */
    static decodeText(text) {
        const inner = text.match(/"((?:[^\\"]|\\.)*)"/);
        if(inner != undefined)
            return inner[1];
        if(text.length > 4 && text.substr(0, 4) == 'hex:') {
            const dataValue = new Uint8Array(Math.floor((text.length - 4) / 2));
            for(let i = 0; i < dataValue.byteLength; ++i)
                dataValue[i] = parseInt(text[i * 2 + 4], 16) | (parseInt(text[i * 2 + 5], 16) << 4);
            return dataValue;
        } else if(!Number.isNaN(parseFloat(text)))
            return parseFloat(text);
        else if(!Number.isNaN(parseInt(text)))
            return parseInt(text);
        else if(text.toLowerCase() === 'nan')
            return NaN;
    }

    /**
     * Concats namespaceIdentity and identity into a symbol
     * @param {number} namespaceIdentity
     * @param {number} identity
     * @return {Symbol} symbol
     */
    static concatIntoSymbol(namespaceIdentity, identity) {
        return `${namespaceIdentity}:${identity}`;
    }

    /**
     * Same as concatIntoSymbol but resolves the namespaceIdentity by name
     * @param {number} namespaceName
     * @param {number} identity
     * @return {Symbol} symbol
     */
    static symbolInNamespace(namespaceName, identity) {
        return BasicBackend.concatIntoSymbol(BasicBackend.identityOfSymbol(symbolByName[namespaceName]), identity);
    }

    /**
     * Extracts the namespaceIdentity of a symbol
     * @param {Symbol} symbol
     * @return {number} namespaceIdentity
     */
    static namespaceOfSymbol(symbol) {
        return parseInt(symbol.split(':')[0]);
    }

    /**
     * Extracts the identity of a symbol
     * @param {Symbol} symbol
     * @return {number} identity
     */
    static identityOfSymbol(symbol) {
        return parseInt(symbol.split(':')[1]);
    }



    /**
     * Fills the ontology with the predefined symbols
     */
    initBasicOntology() {
        for(const name in symbolByName)
            this.setData(this.manifestSymbol(symbolByName[name]), name);
        for(const entity of [symbolByName.BinaryNumber, symbolByName.TwosComplement, symbolByName.IEEE754, symbolByName.UTF8, symbolByName.Composite])
            this.setTriple([entity, symbolByName.Type, symbolByName.Encoding], true);
    }

    /**
     * Converts bits to JS native data types using the given encoding
     * @param {Symbol} encoding
     * @param {Uint8Array} dataBytes
     * @param {Object} feedback Used to control the length (input and output)
     * @param {number} feedback.length in bits
     * @return {Object} dataValue
     */
    decodeBinary(encoding, dataBytes, feedback) {
        const dataView = new DataView(dataBytes.buffer);
        switch(encoding) {
            case symbolByName.Void:
                return dataBytes;
            case symbolByName.BinaryNumber:
            case symbolByName.TwosComplement:
            case symbolByName.IEEE754:
                if(feedback.length < 32)
                    return;
                feedback.length = 32;
                switch(encoding) {
                    case symbolByName.BinaryNumber:
                        return dataView.getUint32(0, true);
                    case symbolByName.TwosComplement:
                        return dataView.getInt32(0, true);
                    case symbolByName.IEEE754:
                        return dataView.getFloat32(0, true);
                }
            case symbolByName.UTF8:
                return this.constructor.utf8ArrayToText(dataBytes);
        }
        if(!this.getTriple([encoding, symbolByName.Type, symbolByName.Composite]))
            return dataBytes;

        const dataValue = [],
              defaultEncoding = this.getSolitary(encoding, symbolByName.Default);

        let slotSize = this.getSolitary(encoding, symbolByName.SlotSize);
        if(slotSize !== symbolByName.Void && slotSize !== symbolByName.Dynamic)
            slotSize = this.getData(slotSize);

        let offset = 0, count = this.getSolitary(encoding, symbolByName.Count);
        if(count === symbolByName.Dynamic)
            count = dataView.getUint32(offset++, true);
        else if(count !== symbolByName.Void)
            count = this.getData(count);

        feedback.length = 0;
        for(let i = 0; (count === symbolByName.Void && feedback.length < dataBytes.length*8) || i < count; ++i) {
            let childEncoding = this.getSolitary(encoding, this.constructor.symbolInNamespace('Index', i));
            if(childEncoding === symbolByName.Void)
                childEncoding = defaultEncoding;
            const childFeedback = {'length': (slotSize === symbolByName.Dynamic) ? dataView.getUint32(offset+i, true) : slotSize};
            let childDataBytes;
            if(childFeedback.length === symbolByName.Void) {
                childDataBytes = dataBytes.slice(feedback.length/8);
                childFeedback.length = childDataBytes.length*8;
            } else if(feedback.length < dataBytes.length*8)
                childDataBytes = dataBytes.slice(feedback.length/8, (feedback.length+childFeedback.length)/8);
            else
                childFeedback.length = 0;
            const childDataValue = this.decodeBinary(childEncoding, childDataBytes, childFeedback);
            dataValue.push(childDataValue);
            feedback.length += childFeedback.length;
        }
        return dataValue;
    }

    /**
     * Converts JS native data types to bits using the given encoding
     * @param {Symbol} encoding
     * @param {Object} dataValue
     * @return {Uint8Array} dataBytes
     */
    encodeBinary(encoding, dataValue) {
        let dataBytes = new Uint8Array(4);
        const dataView = new DataView(dataBytes.buffer);
        switch(encoding) {
            case symbolByName.Void:
                return dataValue;
            case symbolByName.BinaryNumber:
                dataView.setUint32(0, dataValue, true);
                return dataBytes;
            case symbolByName.TwosComplement:
                dataView.setInt32(0, dataValue, true);
                return dataBytes;
            case symbolByName.IEEE754:
                dataView.setFloat32(0, dataValue, true);
                return dataBytes;
            case symbolByName.UTF8:
                return this.constructor.textToUtf8Array(dataValue);
        }
        if(!this.getTriple([encoding, symbolByName.Type, symbolByName.Composite]))
            return dataValue;

        const dataBytesArray = [],
              defaultEncoding = this.getSolitary(encoding, symbolByName.Default);

        let slotSize = this.getSolitary(encoding, symbolByName.SlotSize);
        if(slotSize !== symbolByName.Void && slotSize !== symbolByName.Dynamic)
            slotSize = this.getData(slotSize);

        let offset = 0, count = this.getSolitary(encoding, symbolByName.Count);
        if(count === symbolByName.Dynamic)
            dataView.setUint32(offset++, dataValue.length, true);
        else if(count !== symbolByName.Void && dataValue.length !== this.getData(count))
            console.error('dataValue.length != this.getData(count)');

        let length = 0;
        for(let i = 0; i < dataValue.length; ++i) {
            let childEncoding = this.getSolitary(encoding, this.constructor.symbolInNamespace('Index', i));
            if(childEncoding === symbolByName.Void)
                childEncoding = defaultEncoding;
            const childDataBytes = this.encodeBinary(childEncoding, dataValue[i]);
            if(slotSize === symbolByName.Dynamic)
                dataView.setUint32(offset+i, childDataBytes.length*8, true);
            dataBytesArray.push(childDataBytes);
            length += childDataBytes.length*8;
        }
        dataBytes = new Uint8Array(length/8);
        length = 0;
        for(const childDataBytes of dataBytesArray) {
            dataBytes.set(childDataBytes, length/8);
            length += childDataBytes.length*8;
        }
        return dataBytes;
    }

    /**
     * Returns a symbols entire data converted to JS native data types
     * @param {Symbol} symbol
     * @param {Uint8Array} dataBytes
     * @return {Object} dataValue
     */
    getData(symbol, dataBytes) {
        if(dataBytes == undefined)
            dataBytes = this.getRawData(symbol);
        if(dataBytes.byteLength === 0)
            return;
        const encoding = this.getSolitary(symbol, symbolByName.Encoding);
        return this.decodeBinary(encoding, dataBytes, {'length': dataBytes.length*8});
    }

    /**
     * Replaces the symbols entire data by JS native data types
     * @param {Symbol} symbol
     * @param {Object} dataValue
     * @return {Uint8Array} dataBytes
     */
    setData(symbol, dataValue) {
        let encoding;
        switch(typeof dataValue) {
            case 'undefined':
                encoding = symbolByName.Void;
                this.setSolitary([symbol, symbolByName.Encoding, encoding]);
                break;
            case 'string':
                encoding = symbolByName.UTF8;
                this.setSolitary([symbol, symbolByName.Encoding, encoding]);
                break;
            case 'number':
                if(!Number.isInteger(dataValue))
                    encoding = symbolByName.IEEE754;
                else if(dataValue < 0)
                    encoding = symbolByName.TwosComplement;
                else
                    encoding = symbolByName.BinaryNumber;
                this.setSolitary([symbol, symbolByName.Encoding, encoding]);
                break;
            default:
                encoding = this.getSolitary(symbol, symbolByName.Encoding);
                break;
        }
        const dataBytes = this.encodeBinary(encoding, dataValue);
        this.setRawData(symbol, dataBytes);
        return dataBytes;
    }

    /**
     * Returns the entire data of a symbol
     * @param {Symbol} symbol
     * @return {Uint8Array} dataBytes
     */
    getRawData(symbol) {
        return this.readData(symbol, 0, this.getLength(symbol));
    }

    /**
     * Replaces the entire data of a symbol
     * @param {Symbol} symbol
     * @param {Uint8Array} dataBytes
     */
    setRawData(symbol, dataBytes) {
        if(dataBytes == undefined) {
            this.setLength(symbol, 0);
            return;
        }
        this.setLength(symbol, dataBytes.byteLength * 8);
        this.writeData(symbol, 0, dataBytes.byteLength * 8, dataBytes);
    }

    /**
     * Increases or deceases the length of a symbols virtual space at the end
     * @param {Symbol} symbol
     * @param {number} newLength in bits
     */
    setLength(symbol, newLength) {
        const length = this.getLength(symbol);
        if(newLength > length)
            this.increaseLength(symbol, length, newLength - length);
        else if(newLength < length)
            this.decreaseLength(symbol, newLength, length - newLength);
    }

    /**
     * Unlinks all triples of a symbol and releases it
     * @param {Symbol} symbol
     */
    unlinkSymbol(symbol) {
        for(const triple of this.queryTriples(queryMask.MVV, [symbol, 0, 0]))
            this.setTriple(triple, false);
        for(const triple of this.queryTriples(queryMask.VMV, [0, symbol, 0]))
            this.setTriple(triple, false);
        for(const triple of this.queryTriples(queryMask.VVM, [0, 0, symbol]))
            this.setTriple(triple, false);
        this.releaseSymbol(symbol);
    }

    /**
     * Tests if the given Triple exists
     * @param {Triple} triple
     * @return {boolean} linked
     */
    getTriple(triple) {
        const iterator = this.queryTriples(queryMask.MMM, triple);
        return iterator.next().value.length === 3 && iterator.next().value === 1;
    }

    /**
     * Does the same as setTriple (linked = true) but also unlinks all triples with different values and returns nothing
     * @param {Triple} triple
     */
    setSolitary(triple) {
        let needsToBeLinked = triple[2] !== symbolByName.Void;
        for(const iTriple of this.queryTriples(queryMask.MMV, triple)) {
            if(iTriple[2] == triple[2])
                needsToBeLinked = false;
            else
                this.setTriple(iTriple, false);
        }
        if(needsToBeLinked)
            this.setTriple(triple, true);
    }

    /**
     * Returns the value if exactly one triple matches with the given entity-attribute-pair
     * @param {Symbol} entity
     * @param {Symbol} attribute
     * @return {Symbol} value or Void
     */
    getSolitary(entity, attribute) {
        const iterator = this.queryTriples(queryMask.MMV, [entity, attribute, symbolByName.Void]);
        let triple = iterator.next().value;
        return (iterator.next().value == 1) ? triple[2] : symbolByName.Void;
    }



    /**
     * Stores the ontology as JSON LTS format
     * @return {string} json
     */
    encodeJson() {
        const entities = [];
        for(const tripleE of this.queryTriples(queryMask.VII, [0, 0, 0])) {
            const length = this.getLength(tripleE[0]),
                  data = this.readData(tripleE[0], 0, length),
                  attributes = [];
            if(symbolByName[this.constructor.utf8ArrayToText(data)] === tripleE[0])
                continue;
            for(const tripleA of this.queryTriples(queryMask.MVI, tripleE)) {
                const values = [];
                for(const tripleV of this.queryTriples(queryMask.MMV, tripleA))
                    values.push(tripleV[2]);
                attributes.push(tripleA[1]);
                attributes.push(values);
            }
            entities.push([
                tripleE[0],
                length,
                this.constructor.encodeText(data),
                attributes
            ]);
        }
        return JSON.stringify({
            'symbols': entities
        }, undefined, '\t');
    }

    /**
     * Loads the ontology from JSON LTS format
     * @param {string} json
     */
    decodeJson(json) {
        const entities = new Set();
        for(const entity of JSON.parse(json).symbols) {
            const entitySymbol = entity[0];
            this.manifestSymbol(entitySymbol);
            entities.add(entitySymbol);
            this.setLength(entitySymbol, entity[1]);
            if(entity[1] > 0)
                this.writeData(entitySymbol, 0, entity[1], this.constructor.decodeText(entity[2]));
            const attributes = entity[3];
            for(let i = 0; i < attributes.length; i += 2) {
                const attribute = attributes[i];
                for(const value of attributes[i+1])
                    this.setTriple([entitySymbol, attribute, value], true);
            }
        }
        return entities;
    }
};

{
    let namespace, symbol;
    for(const name in symbolByName) {
        if(namespace !== symbolByName[name]) {
            namespace = symbolByName[name];
            symbol = 0;
        }
        symbolByName[name] = BasicBackend.concatIntoSymbol(namespace, symbol++);
    }
}
