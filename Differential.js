import BasicBackend from './BasicBackend.js';

function getOrCreateEntry(dict, key, value={}) {
    const entry = dict[key];
    return (entry) ? entry : (dict[key] = value);
}

function getOrDefaultEntry(dict, key, value={}) {
    const entry = dict[key];
    return (entry) ? entry : value;
}

/** Differential defining the transformation from one version to another and back.
 * To record the actions from a journal, use the differental as backend and then call commit.
 */
export default class Differential extends BasicBackend {
    /**
     * @param {NativeBackend} backend
     * @param {Identity} repositoryNamespace The namespace identity of the repository
     * @param {RelocationTable} recordingRelocation Relocate recording namespaces to become modal namespaces
     */
    constructor(backend, repositoryNamespace, recordingRelocation={}) {
        super();
        this.backend = backend;
        this.isRecordingFromBackend = true;
        this.repositoryNamespace = repositoryNamespace;
        this.recordingRelocation = recordingRelocation;
        this.preCommitStructure = {};
    }

    static getIntermediateOffset(creaseLengthOperations, intermediateOffset) {
        // TODO: Derivative integration?
        for(let operationIndex = 0; operationIndex < creaseLengthOperations.length; ++operationIndex) {
            const operation = creaseLengthOperations[operationIndex];
            if(intermediateOffset < operation.dstOffset)
                return [intermediateOffset, operationIndex];
            if(operation.length < 0)
                intermediateOffset -= operation.length;
        }
        return [intermediateOffset, creaseLengthOperations.length];
    }

    static getOperationIndex(operations, key, intermediateOffset) {
        // TODO: Use binary search?
        for(let operationIndex = 0; operationIndex < operations.length; ++operationIndex)
            if(intermediateOffset <= operations[operationIndex][key])
                return operationIndex;
        return operations.length;
    }

    addCopyReplaceOperation(mode, operation, operations, operationIndex) {
        if(operations === undefined) {
            const operationsOfSymbol = getOrCreateEntry(this.preCommitStructure, operation[mode+'Symbol']);
            operations = getOrCreateEntry(operationsOfSymbol, (mode == 'src') ? 'copyOperations' : 'replaceOperations', []);
            operationIndex = this.constructor.getOperationIndex(operations, mode+'Offset', operation[mode+'Offset']);
        }
        operations.splice(operationIndex, 0, operation);
    }

    removeCopyReplaceOperation(mode, operation, dirtySymbols, operations, operationIndex) {
        if(operations === undefined) {
            const operationsOfSymbol = this.preCommitStructure[operation[mode+'Symbol']];
            operations = operationsOfSymbol[(mode == 'src') ? 'copyOperations' : 'replaceOperations'];
            operationIndex = operations.indexOf(operation);
        }
        operations.splice(operationIndex, 1);
        if(dirtySymbols && operations.length == 0)
            dirtySymbols.add(operation[mode+'Symbol']);
    }

    removeEmptyCopyReplaceOperations(symbols) {
        for(const symbol of symbols) {
            const operationsOfSymbol = this.preCommitStructure[symbol];
            for(const type of ['copyOperations', 'replaceOperations'])
                if(operationsOfSymbol[type] && operationsOfSymbol[type].length == 0)
                    delete operationsOfSymbol[type];
            if(Object.keys(operationsOfSymbol) == 0) {
                delete this.preCommitStructure[symbol];
                if(BasicBackend.namespaceOfSymbol(symbol) == this.repositoryNamespace)
                    this.backend.unlinkSymbol(symbol);
            }
        }
    }

    cutAndShiftCopyReplaceOperations(mode, operations, dirtySymbols, intermediateOffset, decreaseLength, shift) {
        const complementaryMode = (mode == 'dst') ? 'src' : 'dst';
        if(!operations)
            return;
        const intermediateEndOffset = intermediateOffset+decreaseLength,
              addCopyReplaceOperations = [];
        for(let operationIndex = 0; operationIndex < operations.length; ++operationIndex) {
            const operation = operations[operationIndex],
                  operationEndOffset = operation[mode+'Offset']+operation.length;
            if(operationEndOffset <= intermediateOffset)
                continue;
            const endLength = operationEndOffset-intermediateEndOffset;
            if(operation[mode+'Offset'] < intermediateOffset && intermediateEndOffset < operationEndOffset) {
                const secondPart = {
                    'dstSymbol': operation.dstSymbol,
                    'srcSymbol': operation.srcSymbol,
                    'length': endLength,
                    [mode+'Offset']: intermediateEndOffset+shift,
                    [complementaryMode+'Offset']: operation[complementaryMode+'Offset']+operation.length-endLength
                };
                addCopyReplaceOperations.push(secondPart);
                operation.length = intermediateOffset-operation[mode+'Offset'];
            } else {
                const operationsBeginIsInside = (intermediateOffset <= operation[mode+'Offset'] && operation[mode+'Offset'] <= intermediateEndOffset),
                      operationsEndIsInside = (intermediateOffset <= operationEndOffset && operationEndOffset <= intermediateEndOffset);
                if(operationsBeginIsInside || operationsEndIsInside) {
                    if(operationsBeginIsInside) {
                        if(operationsEndIsInside) {
                            this.removeCopyReplaceOperation(mode, operation, dirtySymbols, operations, operationIndex--);
                            this.removeCopyReplaceOperation(complementaryMode, operation, dirtySymbols);
                        } else {
                            operation[mode+'Offset'] = intermediateEndOffset+shift;
                            operation[complementaryMode+'Offset'] += operation.length-endLength;
                            operation.length = endLength;
                            if(complementaryMode == 'src') {
                                const copyOperations = this.preCommitStructure[operation.srcSymbol].copyOperations,
                                      srcIndex = copyOperations.indexOf(operation);
                                let dstIndex = srcIndex;
                                while(dstIndex+1 < copyOperations.length && copyOperations[dstIndex+1].srcOffset < operation.srcOffset)
                                    ++dstIndex;
                                if(dstIndex > srcIndex)
                                    copyOperations.splice(dstIndex, 0, copyOperations.splice(srcIndex, 1)[0]);
                            }
                        }
                    } else
                        operation.length = intermediateOffset-operation[mode+'Offset'];
                } else if(intermediateEndOffset <= operation[mode+'Offset'])
                    operation[mode+'Offset'] += shift;
            }
        }
        for(const operation of addCopyReplaceOperations) {
            this.addCopyReplaceOperation('dst', operation);
            this.addCopyReplaceOperation('src', operation);
        }
    }

    mergeCopyReplaceOperations(mode, operations, intermediateOffset) {
        // TODO: Take possible DAG-like overlap into account if(mode == 'src')
        const complementaryMode = (mode == 'dst') ? 'src' : 'dst';
        if(!operations)
            return false;
        for(let operationIndex = 1; operationIndex < operations.length; ++operationIndex) {
            const secondOperation = operations[operationIndex];
            if(secondOperation[mode+'Offset'] < intermediateOffset)
                continue;
            const firstOperation = operations[operationIndex-1];
            if(secondOperation[mode+'Offset'] == intermediateOffset &&
               firstOperation[mode+'Offset']+firstOperation.length == secondOperation[mode+'Offset'] &&
               firstOperation[complementaryMode+'Symbol'] == secondOperation[complementaryMode+'Symbol'] &&
               firstOperation[complementaryMode+'Offset']+firstOperation.length == secondOperation[complementaryMode+'Offset'] &&
               firstOperation.srcSymbol == secondOperation.srcSymbol) {
                firstOperation.length += secondOperation.length;
                this.removeCopyReplaceOperation(mode, secondOperation, undefined, operations, operationIndex--);
                this.removeCopyReplaceOperation(complementaryMode, secondOperation, undefined);
                return true;
            } else
                return false;
        }
    }

    shiftIntermediateOffsets(creaseLengthOperations, operationIndex, shift) {
        if(shift != 0)
            for(let i = operationIndex; i < creaseLengthOperations.length; ++i)
                creaseLengthOperations[i].dstOffset += shift;
    }

    saveDataToRestore(srcSymbol, srcOffset, length) {
        console.assert(this.isRecordingFromBackend && srcOffset+length <= this.backend.getLength(srcSymbol));
        const operationsOfSymbol = getOrCreateEntry(this.preCommitStructure, srcSymbol),
              creaseLengthOperations = getOrDefaultEntry(operationsOfSymbol, 'creaseLengthOperations', []);
        if(operationsOfSymbol.manifestOrRelease == 'manifest')
            return;
        let [intermediateOffset, operationIndex] = this.constructor.getIntermediateOffset(creaseLengthOperations, srcOffset),
            decreaseAccumulator = intermediateOffset-srcOffset,
            dstSymbol = operationsOfSymbol.dataRestore,
            replaceOperations = (dstSymbol) ? this.preCommitStructure[dstSymbol].replaceOperations : [];
        const addSlice = (length) => {
            if(length <= 0)
                return;
            let dstOffset = (dstSymbol) ? this.backend.getLength(dstSymbol) : 0,
                replaceOperationIndex = 0;
            if(!dstSymbol) {
                operationsOfSymbol.dataRestore = dstSymbol = this.backend.createSymbol(this.repositoryNamespace);
                this.preCommitStructure[dstSymbol] = {'replaceOperations': replaceOperations};
            } else
                for(; replaceOperationIndex < replaceOperations.length; ++replaceOperationIndex)
                    if(intermediateOffset <= replaceOperations[replaceOperationIndex].srcOffset) {
                        dstOffset = replaceOperations[replaceOperationIndex].dstOffset;
                        break;
                    }
            this.backend.creaseLength(dstSymbol, dstOffset, length);
            this.backend.writeData(dstSymbol, dstOffset, length, this.backend.readData(srcSymbol, intermediateOffset-decreaseAccumulator, length));
            const operation = {
                'dstSymbol': dstSymbol,
                'dstOffset': dstOffset,
                'srcSymbol': srcSymbol,
                'srcOffset': intermediateOffset,
                'length': length
            };
            this.addCopyReplaceOperation('src', operation);
            this.addCopyReplaceOperation('dst', operation, replaceOperations, replaceOperationIndex++);
            for(; replaceOperationIndex < replaceOperations.length; ++replaceOperationIndex)
                replaceOperations[replaceOperationIndex].dstOffset += length;
        };
        const avoidRestoreOperations = (length) => {
            if(length <= 0)
                return;
            if(replaceOperations)
                for(let replaceOperationIndex = 0; length > 0 && replaceOperationIndex < replaceOperations.length; ++replaceOperationIndex) {
                    const operation = replaceOperations[replaceOperationIndex];
                    if(operation.srcOffset+operation.length <= intermediateOffset)
                        continue;
                    if(intermediateOffset+length <= operation.srcOffset)
                        break;
                    const sliceLength = operation.srcOffset-intermediateOffset;
                    addSlice(sliceLength);
                    length -= sliceLength+operation.length;
                    intermediateOffset = operation.srcOffset+operation.length;
                }
            addSlice(length);
        };
        if(operationIndex > 0 && intermediateOffset < creaseLengthOperations[operationIndex-1].dstOffset+creaseLengthOperations[operationIndex-1].length)
            --operationIndex;
        for(; operationIndex < creaseLengthOperations.length && length > 0; ++operationIndex) {
            const operation = creaseLengthOperations[operationIndex];
            if(intermediateOffset+length <= operation.dstOffset)
                break;
            const sliceLength = Math.min(length, operation.dstOffset-intermediateOffset);
            avoidRestoreOperations(sliceLength);
            length -= sliceLength+Math.max(0, operation.length);
            intermediateOffset = operation.dstOffset+Math.abs(operation.length);
            if(operation.length < 0)
                decreaseAccumulator -= operation.length;
        }
        avoidRestoreOperations(length);
        if(replaceOperations)
            for(let replaceOperationIndex = replaceOperations.length-1; replaceOperationIndex > 0; --replaceOperationIndex)
                this.mergeCopyReplaceOperations('dst', replaceOperations, replaceOperations[replaceOperationIndex].dstOffset);
    }

    queryTriples(queryMask, triple) {
        console.assert(this.isRecordingFromBackend);
        return this.backend.queryTriples(queryMask, triple);
    }

    getLength(symbol) {
        console.assert(this.isRecordingFromBackend);
        return this.backend.getLength(symbol);
    }

    manifestSymbol(symbol) {
        console.assert(this.preCommitStructure);
        if(this.isRecordingFromBackend && !this.backend.manifestSymbol(symbol))
            return false;
        symbol = BasicBackend.relocateSymbol(symbol, this.recordingRelocation);
        const operationsOfSymbol = getOrCreateEntry(this.preCommitStructure, symbol);
        if(operationsOfSymbol.manifestOrRelease == 'release') {
            delete operationsOfSymbol.manifestOrRelease;
            if(Object.keys(operationsOfSymbol) == 0)
                delete this.preCommitStructure[symbol];
        } else
            operationsOfSymbol.manifestOrRelease = 'manifest';
        return true;
    }

    releaseSymbol(symbol) {
        console.assert(this.preCommitStructure);
        if(this.isRecordingFromBackend && !this.backend.releaseSymbol(symbol))
            return false;
        symbol = BasicBackend.relocateSymbol(symbol, this.recordingRelocation);
        const operationsOfSymbol = getOrCreateEntry(this.preCommitStructure, symbol);
        if(operationsOfSymbol.manifestOrRelease == 'manifest') {
            delete operationsOfSymbol.manifestOrRelease;
            if(Object.keys(operationsOfSymbol) == 0)
                delete this.preCommitStructure[symbol];
        } else
            operationsOfSymbol.manifestOrRelease = 'release';
        return true;
    }

    setTriple(triple, link) {
        console.assert(this.preCommitStructure);
        if(this.isRecordingFromBackend && !this.backend.setTriple(triple, link))
            return false;
        triple = triple.map(symbol => BasicBackend.relocateSymbol(symbol, this.recordingRelocation));
        const operationsOfSymbol = getOrCreateEntry(this.preCommitStructure, triple[0]),
              attributeDict = getOrCreateEntry(operationsOfSymbol, 'tripleOperations'),
              valueDict = getOrCreateEntry(attributeDict, triple[1]),
              isLinked = valueDict[triple[2]];
        if(isLinked === link)
            return false;
        if(isLinked === undefined)
            valueDict[triple[2]] = link;
        else {
            delete valueDict[triple[2]];
            if(Object.keys(valueDict).length == 0) {
                delete attributeDict[triple[1]];
                if(Object.keys(attributeDict).length == 0) {
                    delete operationsOfSymbol.tripleOperations;
                    if(Object.keys(operationsOfSymbol) == 0)
                        delete this.preCommitStructure[triple[0]];
                }
            }
        }
        return true;
    }

    creaseLength(dstSymbol, dstOffset, length) {
        console.assert(this.preCommitStructure);
        if(length == 0)
            return true;
        if(this.isRecordingFromBackend) {
            const dataLength = this.backend.getLength(dstSymbol);
            if(length < 0) {
                if(dstOffset-length > dataLength)
                    return false;
            } else if(dstOffset > dataLength)
                return false;
        }
        const originalDstSymbol = dstSymbol,
              originalLength = length;
        dstSymbol = BasicBackend.relocateSymbol(dstSymbol, this.recordingRelocation);
        const operationsOfSymbol = getOrCreateEntry(this.preCommitStructure, dstSymbol),
              creaseLengthOperations = getOrCreateEntry(operationsOfSymbol, 'creaseLengthOperations', []),
              dirtySymbols = new Set();
        let operationAtIntermediateOffset,
            [intermediateOffset, operationIndex] = this.constructor.getIntermediateOffset(creaseLengthOperations, dstOffset);
        if(operationIndex > 0) {
            operationAtIntermediateOffset = creaseLengthOperations[operationIndex-1];
            if(operationAtIntermediateOffset.dstOffset+Math.abs(operationAtIntermediateOffset.length) < intermediateOffset)
                operationAtIntermediateOffset = undefined;
        }
        if(length < 0) {
            let decreaseAccumulator = -length,
                increaseAccumulator = 0;
            if(operationAtIntermediateOffset) {
                if(operationAtIntermediateOffset.length < 0)
                    intermediateOffset = operationAtIntermediateOffset.dstOffset;
                --operationIndex;
            }
            const increaseLengthOperations = [];
            let creaseLengthOperationsToDelete = 0;
            for(let i = operationIndex; i < creaseLengthOperations.length; ++i) {
                const operation = creaseLengthOperations[i];
                if(intermediateOffset+decreaseAccumulator < operation.dstOffset)
                    break;
                if(operation.length < 0)
                    decreaseAccumulator -= operation.length;
                else {
                    increaseAccumulator += operation.length;
                    increaseLengthOperations.push(operation);
                }
                ++creaseLengthOperationsToDelete;
            }
            if(this.isRecordingFromBackend)
                this.saveDataToRestore(dstSymbol, dstOffset, -length);
            length = increaseAccumulator-decreaseAccumulator;
            increaseAccumulator = 0;
            let copyOperationIndex = 0;
            const copyOperations = getOrDefaultEntry(operationsOfSymbol, 'copyOperations', []),
                  firstOperation = (operationAtIntermediateOffset) ? operationAtIntermediateOffset : creaseLengthOperations[operationIndex],
                  nextIntermediateOffset = (length > 0 && firstOperation && firstOperation.length > 0) ? firstOperation.dstOffset : intermediateOffset;
            for(let i = -1; i < increaseLengthOperations.length; ++i) {
                let srcOffset = nextIntermediateOffset;
                if(i >= 0) {
                    const operation = increaseLengthOperations[i];
                    increaseAccumulator += operation.length;
                    srcOffset = operation.dstOffset;
                }
                for(; copyOperationIndex < copyOperations.length; ++copyOperationIndex) {
                    const copyOperation = copyOperations[copyOperationIndex];
                    if(copyOperation.srcOffset+copyOperation.length <= srcOffset)
                        continue;
                    if(i+1 < increaseLengthOperations.length && increaseLengthOperations[i+1].dstOffset <= copyOperation.srcOffset)
                        break;
                    if(copyOperation.srcOffset < srcOffset) {
                        // Splitting is an alternative to: this.cutAndShiftCopyReplaceOperations('src', copyOperations, undefined, srcOffset, 0, 0);
                        const endLength = copyOperation.srcOffset+copyOperation.length-srcOffset,
                              secondPart = {
                            'dstSymbol': copyOperation.dstSymbol,
                            'srcSymbol': copyOperation.srcSymbol,
                            'length': endLength,
                            'srcOffset': srcOffset,
                            'dstOffset': copyOperation.dstOffset+copyOperation.length-endLength
                        };
                        copyOperation.length -= endLength;
                        this.addCopyReplaceOperation('dst', secondPart);
                        this.addCopyReplaceOperation('src', secondPart);
                    } else {
                        copyOperation.srcOffset += Math.max(0, length)-increaseAccumulator;
                        if(this.mergeCopyReplaceOperations('src', copyOperations, copyOperation.srcOffset))
                            --copyOperationIndex;
                    }
                }
            }
            creaseLengthOperations.splice(operationIndex, creaseLengthOperationsToDelete);
            const annihilated = increaseAccumulator-Math.max(0, length);
            this.shiftIntermediateOffsets(creaseLengthOperations, operationIndex, -annihilated);
            this.cutAndShiftCopyReplaceOperations('dst', operationsOfSymbol.replaceOperations, dirtySymbols, intermediateOffset, decreaseAccumulator, -annihilated);
            this.mergeCopyReplaceOperations('dst', operationsOfSymbol.replaceOperations, intermediateOffset);
            this.removeEmptyCopyReplaceOperations(dirtySymbols);
            intermediateOffset = nextIntermediateOffset;
        } else {
            let mergeAccumulator = 0;
            if(operationAtIntermediateOffset) {
                if(operationAtIntermediateOffset.length < 0) {
                    const annihilate = Math.min(-operationAtIntermediateOffset.length, length);
                    if(annihilate === -operationAtIntermediateOffset.length) {
                        intermediateOffset = operationAtIntermediateOffset.dstOffset;
                        creaseLengthOperations.splice(--operationIndex, 1);
                    } else
                        operationAtIntermediateOffset.length += annihilate;
                    length -= annihilate;
                } else {
                    operationAtIntermediateOffset.length += length;
                    mergeAccumulator = length;
                }
            }
            if(length > 0) {
                this.shiftIntermediateOffsets(creaseLengthOperations, operationIndex, length);
                this.cutAndShiftCopyReplaceOperations('src', operationsOfSymbol.copyOperations, undefined, intermediateOffset, 0, length);
                this.cutAndShiftCopyReplaceOperations('dst', operationsOfSymbol.replaceOperations, undefined, intermediateOffset, 0, length);
                length -= mergeAccumulator;
            }
        }
        if(length != 0)
            creaseLengthOperations.splice(operationIndex, 0, {
                'dstSymbol': dstSymbol,
                'dstOffset': intermediateOffset,
                'length': length
            });
        if(creaseLengthOperations.length == 0) {
            delete operationsOfSymbol.creaseLengthOperations;
            if(Object.keys(operationsOfSymbol) == 0)
                delete this.preCommitStructure[dstSymbol];
        }
        console.assert(!this.isRecordingFromBackend || this.backend.creaseLength(originalDstSymbol, dstOffset, originalLength));
        return true;
    }

    replaceDataSimultaneously(replaceOperations) {
        console.assert(this.preCommitStructure);
        if(this.isRecordingFromBackend)
            for(const operation of replaceOperations)
                if(operation.length < 0 ||
                   operation.dstOffset+operation.length > this.backend.getLength(operation.dstSymbol) ||
                   operation.srcOffset+operation.length > this.backend.getLength(operation.srcSymbol))
                    return false;
        const context = {},
              dirtySymbols = new Set(),
              cutReplaceOperations = [],
              addCopyReplaceOperations = [],
              mergeCopyReplaceOperations = [],
              addSlice = (srcSymbol, srcOffset, length) => {
            const operationsOfSymbol = getOrDefaultEntry(this.preCommitStructure, srcSymbol, {}),
                  srcCreaseLengthOperations = getOrDefaultEntry(operationsOfSymbol, 'creaseLengthOperations', []);
            for(let operationIndex = 0; operationIndex < srcCreaseLengthOperations.length; ++operationIndex) {
                const operation = srcCreaseLengthOperations[operationIndex];
                if(operation.dstOffset+Math.abs(operation.length) <= srcOffset)
                    continue;
                if(operation.dstOffset >= srcOffset+length)
                    break;
                if(operation.length > 0)
                    throw new Error('Tried to copy data from uninitialized increased slice');
            }
            if(context.dstSymbol != srcSymbol || context.dstIntermediateOffset != srcOffset)
                addCopyReplaceOperations.push({
                    'dstSymbol': context.dstSymbol,
                    'dstOffset': context.dstIntermediateOffset,
                    'srcSymbol': srcSymbol,
                    'srcOffset': srcOffset,
                    'length': length
                });
            context.dstIntermediateOffset += length;
            context.srcIntermediateOffset += length;
        }, backTrackSrc = (length) => {
            cutReplaceOperations.push({'dstSymbol': context.dstSymbol, 'dstOffset': context.dstIntermediateOffset, 'length': length});
            for(; context.srcReplaceOperationIndex < context.srcReplaceOperations.length; ++context.srcReplaceOperationIndex) {
                const operation = context.srcReplaceOperations[context.srcReplaceOperationIndex];
                if(context.srcIntermediateOffset <= operation.dstOffset+operation.length)
                    break;
            }
            while(length > 0 && context.srcReplaceOperationIndex < context.srcReplaceOperations.length) {
                const operation = context.srcReplaceOperations[context.srcReplaceOperationIndex];
                if(context.srcIntermediateOffset+length <= operation.dstOffset)
                    break;
                if(context.srcIntermediateOffset < operation.dstOffset) {
                    const sliceLength = operation.dstOffset-context.srcIntermediateOffset;
                    addSlice(context.srcSymbol, context.srcIntermediateOffset, sliceLength);
                    length -= sliceLength;
                }
                const sliceStartOffset = Math.max(context.srcIntermediateOffset, operation.dstOffset),
                      sliceEndOffset = Math.min(context.srcIntermediateOffset+length, operation.dstOffset+operation.length);
                if(sliceStartOffset < sliceEndOffset) {
                    const sliceLength = sliceEndOffset-sliceStartOffset;
                    addSlice(operation.srcSymbol, operation.srcOffset+context.srcIntermediateOffset-operation.dstOffset, sliceLength);
                    length -= sliceLength;
                }
                if(operation.dstOffset+operation.length <= context.srcIntermediateOffset)
                    ++context.srcReplaceOperationIndex;
            }
            if(length > 0)
                addSlice(context.srcSymbol, context.srcIntermediateOffset, length);
        }, skipDecreaseOperations = (contextSlot, handleSlice, length) => {
            const creaseLengthOperations = context[contextSlot+'CreaseLengthOperations'];
            for(let operationIndex = context[contextSlot+'OperationIndex']; operationIndex < creaseLengthOperations.length && length > 0; ++operationIndex) {
                const operation = creaseLengthOperations[operationIndex];
                if(operation.dstOffset+Math.abs(operation.length) <= context[contextSlot+'IntermediateOffset'])
                    continue;
                if(context[contextSlot+'IntermediateOffset']+length <= operation.dstOffset)
                    break;
                if(operation.length < 0) {
                    const sliceLength = Math.min(length, operation.dstOffset-context[contextSlot+'IntermediateOffset']);
                    handleSlice(sliceLength);
                    length -= sliceLength;
                    context[contextSlot+'IntermediateOffset'] = operation.dstOffset-operation.length;
                }
            }
            if(length > 0)
                handleSlice(length);
        }, skipSrcDecreaseOperations = skipDecreaseOperations.bind(this, 'src', backTrackSrc),
           skipDstDecreaseOperations = skipDecreaseOperations.bind(this, 'dst', skipSrcDecreaseOperations);
        for(const operation of replaceOperations) {
            if(operation.length <= 0 || (operation.dstSymbol == operation.srcSymbol && operation.dstOffset == operation.srcOffset))
                continue;
            for(const mode of ['dst', 'src']) {
                context[mode+'Symbol'] = BasicBackend.relocateSymbol(operation[mode+'Symbol'], this.recordingRelocation);
                context[mode+'OperationsOfSymbol'] = getOrDefaultEntry(this.preCommitStructure, context[mode+'Symbol'], {});
                context[mode+'CreaseLengthOperations'] = getOrDefaultEntry(context[mode+'OperationsOfSymbol'], 'creaseLengthOperations', []);
                [context[mode+'IntermediateOffset'], context[mode+'OperationIndex']] = this.constructor.getIntermediateOffset(context[mode+'CreaseLengthOperations'], operation[mode+'Offset']);
            }
            context.srcReplaceOperations = getOrDefaultEntry(context.srcOperationsOfSymbol, 'replaceOperations', []);
            context.srcReplaceOperationIndex = 0;
            mergeCopyReplaceOperations.push({'dstSymbol': context.dstSymbol, 'dstOffset': context.dstIntermediateOffset});
            skipDstDecreaseOperations(operation.length);
            mergeCopyReplaceOperations.push({'dstSymbol': context.dstSymbol, 'dstOffset': context.dstIntermediateOffset});
            if(this.isRecordingFromBackend)
                this.saveDataToRestore(BasicBackend.relocateSymbol(operation.dstSymbol, this.recordingRelocation), operation.dstOffset, operation.length);
        }
        for(const operation of cutReplaceOperations)
            this.cutAndShiftCopyReplaceOperations('dst', getOrCreateEntry(this.preCommitStructure, operation.dstSymbol).replaceOperations, dirtySymbols, operation.dstOffset, operation.length, 0);
        for(const operation of addCopyReplaceOperations) {
            this.addCopyReplaceOperation('dst', operation);
            this.addCopyReplaceOperation('src', operation);
        }
        for(const operation of mergeCopyReplaceOperations)
            this.mergeCopyReplaceOperations('dst', getOrCreateEntry(this.preCommitStructure, operation.dstSymbol).replaceOperations, operation.dstOffset);
        this.removeEmptyCopyReplaceOperations(dirtySymbols);
        console.assert(!this.isRecordingFromBackend || this.backend.replaceDataSimultaneously(replaceOperations));
        return true;
    }

    writeData(dstSymbol, dstOffset, length, dataBytes) {
        console.assert(this.preCommitStructure);
        dstSymbol = BasicBackend.relocateSymbol(dstSymbol, this.recordingRelocation);
        const srcSymbol = this.backend.createSymbol(this.repositoryNamespace);
        this.backend.setRawData(srcSymbol, dataBytes, length);
        return this.replaceData(dstSymbol, dstOffset, srcSymbol, 0, length);
    }

    /**
     * Scan through all internal structures and check their integrity
     * @return {Boolean} True on success
     */
    validateIntegrity() {
        console.assert(this.preCommitStructure);
        function checkOperations(operations, location, key, negativeAllowed, overlapAllowed) {
            if(operations)
                for(let i = 0; i < operations.length; ++i) {
                    if(operations[i].length == 0) {
                        console.warn(`Empty entry in ${location}`);
                        return false;
                    }
                    if(!negativeAllowed && operations[i].length < 0) {
                        console.warn(`Negative entry in ${location}`);
                        return false;
                    }
                    if(i > 0 && operations[i-1][key] > operations[i][key]) {
                        console.warn(`Wrong order in ${location}`);
                        return false;
                    }
                    if(!overlapAllowed && i > 0 && operations[i-1][key]+operations[i-1].length > operations[i][key]) {
                        console.warn(`Overlap in ${location}`);
                        return false;
                    }
                }
            return true;
        }
        for(const symbol in this.preCommitStructure) {
            const operationsOfSymbol = this.preCommitStructure[symbol];
            if(Object.keys(operationsOfSymbol) == 0) {
                console.warn(`Empty entry in preCommitStructure['${symbol}']`);
                return false;
            }
            for(const type of ['tripleOperations', 'copyOperations', 'replaceOperations', 'creaseLengthOperations'])
                if(operationsOfSymbol[type] && operationsOfSymbol[type].length == 0) {
                    console.warn(`Empty entry in preCommitStructure['${symbol}']['${type}']`);
                    return false;
                }
            if(!checkOperations(operationsOfSymbol.copyOperations, `operationsOfSymbol['${symbol}'].copyOperations`, 'srcOffset', false, true))
                return false;
            if(!checkOperations(operationsOfSymbol.replaceOperations, `operationsOfSymbol['${symbol}'].replaceOperations`, 'dstOffset', false, false))
                return false;
            if(!checkOperations(operationsOfSymbol.creaseLengthOperations, `operationsOfSymbol['${symbol}'].creaseLengthOperations`, 'dstOffset', true, false))
                return false;
            // TODO: Check increases covered by replaces and free of copyOperations
            // TODO: Check decreases free of replaceOperations
        }
        return true;
    }

    /**
     * Optimizes the internal structures so that they are ready to be applied, but no further recording can happen afterwards.
     */
    commit() {
        console.assert(this.preCommitStructure);
        this.postCommitStructure = {
            'manifestSymbols': [],
            'releaseSymbols': [],
            'linkTripleOperations': [],
            'unlinkTripleOperations': [],
            'increaseLengthOperations': [],
            'decreaseLengthOperations': [],
            'replaceDataOperations': [],
            'restoreDataOperations': [],
            'dataSources': [],
            'dataRestores': [],
            'minimumLengths': []
        };
        for(const symbol in this.preCommitStructure) {
            if(BasicBackend.namespaceOfSymbol(symbol) == this.repositoryNamespace)
                continue;
            const operationsOfSymbol = this.preCommitStructure[symbol];
            if(operationsOfSymbol.manifestOrRelease)
                this.postCommitStructure[(operationsOfSymbol.manifestOrRelease == 'manifest') ? 'manifestSymbols' : 'releaseSymbols'].push(symbol);
            const triple = [symbol];
            if(operationsOfSymbol.tripleOperations)
                for(triple[1] in operationsOfSymbol.tripleOperations)
                    for(triple[2] in operationsOfSymbol.tripleOperations[triple[1]]) {
                        const link = operationsOfSymbol.tripleOperations[triple[1]][triple[2]];
                        this.postCommitStructure[(link ? 'link' : 'unlink')+'TripleOperations'].push({'triple': [...triple]});
                    }
            let minimumLengths = [0, 0], creaseAccumulators = [0, 0];
            function maximizeMinimumLength(operations, key, slot) {
                const lastOperation = operations[operations.length-1];
                minimumLengths[slot] = Math.max(minimumLengths[slot], lastOperation[key]+Math.abs(lastOperation.length)-creaseAccumulators[slot]);
            }
            if(operationsOfSymbol.creaseLengthOperations) {
                const increaseLengthOperations = operationsOfSymbol.creaseLengthOperations.filter(operation => operation.length > 0),
                      decreaseLengthOperations = operationsOfSymbol.creaseLengthOperations.filter(operation => operation.length < 0).reverse();
                this.postCommitStructure.increaseLengthOperations.splice(this.postCommitStructure.increaseLengthOperations.length-1, 0, ...increaseLengthOperations);
                this.postCommitStructure.decreaseLengthOperations.splice(this.postCommitStructure.decreaseLengthOperations.length-1, 0, ...decreaseLengthOperations);
                creaseAccumulators[0] = increaseLengthOperations.reduce((total, operation) => total+operation.length, 0);
                creaseAccumulators[1] = decreaseLengthOperations.reduce((total, operation) => total-operation.length, 0);
                maximizeMinimumLength(operationsOfSymbol.creaseLengthOperations, 'dstOffset', 0);
                maximizeMinimumLength(operationsOfSymbol.creaseLengthOperations, 'dstOffset', 1);
            }
            if(operationsOfSymbol.replaceOperations) {
                this.postCommitStructure.replaceDataOperations.splice(this.postCommitStructure.replaceDataOperations.length-1, 0, ...operationsOfSymbol.replaceOperations);
                maximizeMinimumLength(operationsOfSymbol.replaceOperations, 'dstOffset', 0);
            }
            if(operationsOfSymbol.copyOperations) {
                this.postCommitStructure.restoreDataOperations.splice(this.postCommitStructure.restoreDataOperations.length-1, 0,
                    ...operationsOfSymbol.copyOperations.filter(operation => BasicBackend.namespaceOfSymbol(operation.dstSymbol) == this.repositoryNamespace));
                maximizeMinimumLength(operationsOfSymbol.copyOperations, 'srcOffset', 1);
            }
            this.postCommitStructure.minimumLengths.push({'srcSymbol': symbol, 'forwardLength': minimumLengths[0], 'reverseLength': minimumLengths[1]});
            for(const type of ['dataSource', 'dataRestore'])
                if(operationsOfSymbol[type])
                    this.postCommitStructure[type+'s'].push(operationsOfSymbol[type]);
        }
        delete this.preCommitStructure;
        // TODO: Optimize data source and data restore
    }

    /**
     * Applies this differential to a checkout
     * @param {Boolean} reverse Set to true to revert this differential
     * @param {RelocationTable} checkoutRelocation Relocate modal namespaces to become checkout namespaces
     * @param {BasicBackend} dst Apply to another differential or the backend (default)
     * @return {Boolean} True on success
     */
    apply(reverse, checkoutRelocation={}, dst=this.backend) {
        console.assert(this.postCommitStructure);
        // TODO: Validate everything first before applying anything: manifest/release symbols
        for(const [type, link] of [['linkTripleOperations', true], ['unlinkTripleOperations', false]])
            for(const operation of this.postCommitStructure[type])
                if((dst.getTriple(operation.triple.map(symbol => BasicBackend.relocateSymbol(symbol, checkoutRelocation))) == link) != reverse)
                    return false;
        for(const operation of this.postCommitStructure.minimumLengths)
            if(this.backend.getLength(BasicBackend.relocateSymbol(operation.srcSymbol, checkoutRelocation)) < operation[((reverse) ? 'reverse' : 'forward')+'Length'])
                return false;
        for(const symbol of this.postCommitStructure[(reverse) ? 'releaseSymbols' : 'manifestSymbols'])
            dst.manifestSymbol(BasicBackend.relocateSymbol(symbol, checkoutRelocation));
        for(const operation of (reverse) ? Array.reversed(this.postCommitStructure.decreaseLengthOperations) : this.postCommitStructure.increaseLengthOperations)
            console.assert(dst.creaseLength(BasicBackend.relocateSymbol(operation.dstSymbol, checkoutRelocation), operation.dstOffset, (reverse) ? -operation.length : operation.length));
        const replaceOperations = (reverse)
            ? this.postCommitStructure.restoreDataOperations.map(operation => { return {
                'srcSymbol': BasicBackend.relocateSymbol(operation.dstSymbol, checkoutRelocation),
                'dstSymbol': BasicBackend.relocateSymbol(operation.srcSymbol, checkoutRelocation),
                'srcOffset': operation.dstOffset,
                'dstOffset': operation.srcOffset,
                'length': operation.length
            };})
            : this.postCommitStructure.replaceDataOperations.map(operation => { return {
                'srcSymbol': BasicBackend.relocateSymbol(operation.srcSymbol, checkoutRelocation),
                'dstSymbol': BasicBackend.relocateSymbol(operation.dstSymbol, checkoutRelocation),
                'srcOffset': operation.srcOffset,
                'dstOffset': operation.dstOffset,
                'length': operation.length
            };});
        console.assert(dst.replaceDataSimultaneously(replaceOperations));
        for(const operation of (reverse) ? Array.reversed(this.postCommitStructure.increaseLengthOperations) : this.postCommitStructure.decreaseLengthOperations)
            console.assert(dst.creaseLength(BasicBackend.relocateSymbol(operation.dstSymbol, checkoutRelocation), operation.dstOffset, (reverse) ? -operation.length : operation.length));
        for(const [type, link] of [['linkTripleOperations', true], ['unlinkTripleOperations', false]])
            for(const operation of this.postCommitStructure[type])
                console.assert(dst.setTriple(operation.triple.map(symbol => BasicBackend.relocateSymbol(symbol, checkoutRelocation)), link != reverse));
        for(const symbol of this.postCommitStructure[(reverse) ? 'manifestSymbols' : 'releaseSymbols'])
            console.assert(dst.releaseSymbol(BasicBackend.relocateSymbol(symbol, checkoutRelocation)));
        return true;
    }
}
