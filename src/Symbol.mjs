/**
 * Symbols are internally represented using a colon separated string.
 */
export class SymbolInternalsColonString {
    /**
     * Validates if the input is a symbol
     * @param {Symbol} symbol
     * @return {boolean}
     */
    static validateSymbol(symbol) {
        return typeof symbol == 'string' && /^[0-9]+:[0-9]+$/.test(symbol);
    }

    /**
     * Exports a symbol to a string
     * @param {Symbol} symbol
     * @return {string} string
     */
    static symbolToString(symbol) {
        return symbol;
    }

    /**
     * Imports a symbol from a string
     * @param {string} string
     * @return {Symbol} symbol
     */
    static symbolFromString(string) {
        return string;
    }

    static tripleFromString(string) {
        return string.split(';').map(string => this.symbolFromString(string));
    }

    static tripleToString(triple) {
        return triple.map(symbol => this.symbolToString(symbol)).join(';');
    }

    /**
     * Extracts the namespaceIdentity of a symbol
     * @param {Symbol} symbol
     * @return {Identity} namespaceIdentity
     */
    static namespaceOfSymbol(symbol) {
        return parseInt(symbol.split(':')[0]);
    }

    /**
     * Extracts the identity of a symbol
     * @param {Symbol} symbol
     * @return {Identity} identity
     */
    static identityOfSymbol(symbol) {
        return parseInt(symbol.split(':')[1]);
    }

    /**
     * Concats namespaceIdentity and identity into a symbol
     * @param {Identity} namespaceIdentity
     * @param {Identity} identity
     * @return {Symbol} symbol
     */
    static concatIntoSymbol(namespaceIdentity, identity) {
        return [namespaceIdentity, identity].join(':');
    }

    /**
     * Compares two symbols for equivalence
     * @param {Symbol} symbolA
     * @param {Symbol} symbolB
     * @return {boolean} equal
     */
    static areSymbolsEqual(symbolA, symbolB) {
        return symbolA == symbolB;
    }

    /**
     * Compares two symbols
     * @param {Symbol} symbolA
     * @param {Symbol} symbolB
     * @return {number} result (negative: a < b, neutral: a == b, positive: a > b)
     */
    static compareSymbols(symbolA, symbolB) {
        const splitA = symbolA.split(':'),
              splitB = symbolB.split(':');
        const namespaceIdDiff = splitA[0]-splitB[0];
        return (namespaceIdDiff) ? namespaceIdDiff : splitA[1]-splitB[1];
    }
};

/**
 * SymbolMap of string symbols (colon notation) using JS dicts
 */
export class SymbolMapString {
    static create() {
        return {};
    }

    static count(collection) {
        return Object.keys(collection).length;
    }

    static isEmpty(collection) {
        return Object.keys(collection).length == 0;
    }

    static insert(collection, symbol, element) {
        if(collection[symbol] !== undefined)
            return false;
        collection[symbol] = element;
        return true;
    }

    static remove(collection, symbol) {
        if(collection[symbol] === undefined)
            return false;
        delete collection[symbol];
        return true;
    }

    static get(collection, symbol) {
        return collection[symbol];
    }

    static getOrInsert(collection, symbol, defaultElement) {
        const element = collection[symbol];
        return (element !== undefined) ? element : (collection[symbol] = defaultElement);
    }

    static entries(collection) {
        return Object.entries(collection);
    }

    static symbols(collection) {
        return Object.keys(collection);
    }
};