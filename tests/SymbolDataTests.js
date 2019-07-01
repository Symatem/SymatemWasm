export default function(ontology, rand) {
    const destination = ontology.createSymbol(4),
          source = ontology.createSymbol(4);

    function bitStringOfBuffer(buffer, length) {
        const result = [];
        for(let i = 0; i < length; ++i)
            result.push(((buffer[Math.floor(i/8)]>>(i%8))&1) ? '1' : '0');
        return result.join('');
    }

    function bitStringOfSymbol(symbol) {
        const handle = ontology.getHandle(symbol);
        return bitStringOfBuffer(handle.dataBytes, handle.dataLength);
    }

    function fillSymbol(symbol) {
        const handle = ontology.getHandle(symbol);
        handle.dataLength = rand.range(0, 512);
        handle.dataBytes = rand.bytes(Math.ceil(handle.dataLength/32)*4);
        return [bitStringOfSymbol(symbol), handle.dataLength, rand.range(0, handle.dataLength)];
    }

    function addBracesAt(string, offset, length) {
        return [string.substr(0, offset), '[', string.substr(offset, length), ']', string.substr(offset+length)].join('');
    }

    return {
        'decreaseLength': () => {
            const [destinationString, destinationLength, destinationOffset] = fillSymbol(destination),
                  length = rand.range(0, destinationLength-destinationOffset),
                  expectedString = [destinationString.substr(0, destinationOffset), destinationString.substr(destinationOffset+length)].join('');
            ontology.creaseLength(destination, destinationOffset, -length);
            const resultString = bitStringOfSymbol(destination);
            if(expectedString != resultString) {
                console.error(
                    destinationOffset, destinationLength, length,
                    addBracesAt(destinationString, destinationOffset, length),
                    addBracesAt(expectedString, destinationOffset, 0),
                    addBracesAt(resultString, destinationOffset, 0)
                );
                return false;
            }
            return true;
        },
        'increaseLength': () => {
            const [destinationString, destinationLength, destinationOffset] = fillSymbol(destination),
                  length = rand.range(0, 512),
                  expectedString = [destinationString.substr(0, destinationOffset), new Array(length).fill('0').join(''), destinationString.substr(destinationOffset)].join('');
            ontology.creaseLength(destination, destinationOffset, length);
            const resultString = bitStringOfSymbol(destination);
            if(expectedString != resultString) {
                console.error(
                    destinationOffset, destinationLength, length,
                    addBracesAt(destinationString, destinationOffset, 0),
                    addBracesAt(expectedString, destinationOffset, length),
                    addBracesAt(resultString, destinationOffset, length)
                );
                return false;
            }
            return true;
        },
        'readData': () => {
            const [sourceString, sourceLength, sourceOffset] = fillSymbol(source),
                  length = rand.range(0, sourceLength-sourceOffset),
                  expectedString = sourceString.substr(sourceOffset, length);
            const resultString = bitStringOfBuffer(ontology.readData(source, sourceOffset, length), length);
            if(expectedString != resultString) {
                console.error(
                    sourceOffset, sourceLength, length,
                    addBracesAt(sourceString, sourceOffset, length),
                    expectedString,
                    resultString
                );
                return false;
            }
            return true;
        },
        'writeData': () => {
            const [destinationString, destinationLength, destinationOffset] = fillSymbol(destination),
                  sourceLength = rand.range(0, Math.min(destinationLength-destinationOffset)),
                  sourceBuffer = rand.bytes(Math.ceil(sourceLength/32)*4),
                  sourceString = bitStringOfBuffer(sourceBuffer, sourceLength),
                  expectedString = [destinationString.substr(0, destinationOffset), sourceString.substr(0, sourceLength), destinationString.substr(destinationOffset+sourceLength)].join('');
            ontology.writeData(destination, destinationOffset, sourceLength, sourceBuffer);
            const resultString = bitStringOfSymbol(destination);
            if(expectedString != resultString) {
                console.error(
                    destinationOffset, destinationLength, sourceLength,
                    sourceString,
                    addBracesAt(destinationString, destinationOffset, sourceLength),
                    addBracesAt(expectedString, destinationOffset, sourceLength),
                    addBracesAt(resultString, destinationOffset, sourceLength)
                );
                return false;
            }
            return true;
        },
        'replaceData': () => {
            const [destinationString, destinationLength, destinationOffset] = fillSymbol(destination),
                  [sourceString, sourceLength, sourceOffset] = fillSymbol(source),
                  length = rand.range(0, Math.min(destinationLength-destinationOffset, sourceLength-sourceOffset)),
                  expectedString = [destinationString.substr(0, destinationOffset), sourceString.substr(sourceOffset, length), destinationString.substr(destinationOffset+length)].join('');
            ontology.replaceData(destination, destinationOffset, source, sourceOffset, length);
            const resultString = bitStringOfSymbol(destination);
            if(expectedString != resultString) {
                console.error(
                    destinationOffset, destinationLength, sourceOffset, sourceLength, length,
                    addBracesAt(sourceString, sourceOffset, length),
                    addBracesAt(destinationString, destinationOffset, length),
                    addBracesAt(expectedString, destinationOffset, length),
                    addBracesAt(resultString, destinationOffset, length)
                );
                return false;
            }
            return true;
        }
    };
}