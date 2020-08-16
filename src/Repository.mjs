import {RelocationTable, SymbolInternals, SymbolMap, Diff} from '../SymatemJS.mjs';

/** The repository is a DAG with the versions being vertices and the edges containing the diffs */
export default class Repository {
    /**
     * @param {BasicBackend} backend
     * @param {Identity} namespaceIdentity The namespace identity of the repository
     * @param {RelocationTable} relocationTable Relocate recording namespaces to become modal namespaces
     */
    constructor(backend, namespaceIdentity, relocationTable=RelocationTable.create()) {
        this.backend = backend;
        this.namespaceIdentity = namespaceIdentity;
        this.relocationTable = relocationTable;
        this.backend.manifestSymbol(SymbolInternals.concatIntoSymbol(this.backend.metaNamespaceIdentity, this.namespaceIdentity));
        for(const [recordingNamespaceIdentity, modalNamespaceIdentity] of RelocationTable.entries(this.relocationTable)) {
            this.backend.manifestSymbol(SymbolInternals.concatIntoSymbol(this.backend.metaNamespaceIdentity, recordingNamespaceIdentity));
            this.backend.manifestSymbol(SymbolInternals.concatIntoSymbol(this.backend.metaNamespaceIdentity, modalNamespaceIdentity));
        }
    }

    /** Gets the list of versions in this repository
     * @yield {Symbol} version
     */
    *getVersions() {
        for(const triple of this.backend.queryTriples(this.backend.queryMasks.VMM, [this.backend.symbolByName.Void, this.backend.symbolByName.Type, this.backend.symbolByName.Version]))
            yield triple[0];
    }

    /** Gets the list of edges in this repository
     * @yield {Symbol} diff
     */
    *getEdges() {
        for(const triple of this.backend.queryTriples(this.backend.queryMasks.VMM, [this.backend.symbolByName.Void, this.backend.symbolByName.Type, this.backend.symbolByName.Edge]))
            yield triple[0];
    }

    /** Gets a versions relatives and their diffs
     * @param {Symbol} version The version to query
     * @param {Symbol} kind Parent or Child
     * @return {SymbolMap} Diffs as keys and versions as values
     */
    getRelatives(version, kind) {
        const result = SymbolMap.create();
        for(const triple of this.backend.queryTriples(this.backend.queryMasks.MMV, [version, kind, this.backend.symbolByName.Void])) {
            const relative = this.backend.getPairOptionally(triple[2], kind);
            SymbolMap.set(result, triple[2], relative);
        }
        return result;
    }

    /** Find an edge by its vertices
     * @param {Symbol} parentVersion The parent vertex
     * @param {Symbol} childVersion The child vertex
     * @return {Symbol} The edge or Void
     */
    getEdge(parentVersion, childVersion) {
        for(const [edge, relative] of SymbolMap.entries(this.getRelatives(parentVersion, this.backend.symbolByName.Child)))
            if(relative == childVersion)
                return edge;
        return this.backend.symbolByName.Void;
    }

    /**
     * @typedef {Object} RepositoryPathEntry
     * @property {Symbol} version
     * @property {Diff} diff
     * @property {boolean} direction
     */

    /** Finds the shortest path between two versions or a destination and the closest materialized version
     * @param {Symbol} dstVersion Destination version
     * @param {Symbol} srcVersion Source version (optional, closest materialized version is used otherwise)
     * @return {RepositoryPathEntry[]} Path from source to destination
     */
    findPath(dstVersion, srcVersion) {
        const path = [], queue = [dstVersion], discoveredBy = SymbolMap.create();
        SymbolMap.set(discoveredBy, dstVersion, true);
        while(queue.length > 0) {
            let version = queue.shift();
            if(srcVersion == version || (!srcVersion && this.backend.getTriple([version, this.backend.symbolByName.Materialization, this.backend.symbolByName.Void], this.backend.queryMasks.MMI))) {
                path.push({'version': version});
                while(true) {
                    const entry = SymbolMap.get(discoveredBy, version);
                    if(entry === true)
                        break;
                    path.push(entry);
                    version = entry.version;
                }
                break;
            }
            for(const [edge, relative] of SymbolMap.entries(this.getRelatives(version, this.backend.symbolByName.Parent)))
                if(!SymbolMap.get(discoveredBy, relative)) {
                    SymbolMap.set(discoveredBy, relative, {'version': version, 'edge': edge, 'direction': false});
                    queue.push(relative);
                }
            for(const [edge, relative] of SymbolMap.entries(this.getRelatives(version, this.backend.symbolByName.Child)))
                if(!SymbolMap.get(discoveredBy, relative)) {
                    SymbolMap.set(discoveredBy, relative, {'version': version, 'edge': edge, 'direction': true});
                    queue.push(relative);
                }
        }
        return path;
    }

    /** Adds a vertex to the DAG and returns it
     * @return {Symbol} version
     */
    createVersion() {
        const version = this.backend.createSymbol(this.namespaceIdentity);
        this.backend.setTriple([version, this.backend.symbolByName.Type, this.backend.symbolByName.Version], true);
        return version;
    }

    /** Removes a vertex, its materialization and all its connecting edges from the DAG
     * @param {Symbol} version The version to remove
     */
    removeVersion(version) {
        for(const edge of SymbolMap.keys(this.getRelatives(version, this.backend.symbolByName.Parent)))
            this.removeEdge(edge);
        for(const edge of SymbolMap.keys(this.getRelatives(version, this.backend.symbolByName.Child)))
            this.removeEdge(edge);
        this.dematerializeVersion(version);
        this.backend.unlinkSymbol(version);
    }

    /** Adds an edge to the DAG
     * @param {Symbol} parentVersion The parent vertex
     * @param {Symbol} childVersion The child vertex
     * @param {Diff} diff The diff of the edge
     * @return {Symbol} The created edge
     */
    addEdge(parentVersion, childVersion, diff) {
        const edge = this.backend.createSymbol(this.namespaceIdentity);
        this.backend.setTriple([edge, this.backend.symbolByName.Type, this.backend.symbolByName.Edge], true);
        this.backend.setTriple([edge, this.backend.symbolByName.Parent, parentVersion], true);
        this.backend.setTriple([edge, this.backend.symbolByName.Child, childVersion], true);
        if(diff)
            this.backend.setTriple([edge, this.backend.symbolByName.Diff, diff.symbol], true);
        this.backend.setTriple([childVersion, this.backend.symbolByName.Parent, edge], true);
        this.backend.setTriple([parentVersion, this.backend.symbolByName.Child, edge], true);
        return edge;
    }

    /** Removes an edge from the DAG
     * @param {Symbol} edge The edge
     */
    removeEdge(edge) {
        const diffSymbol = this.backend.getPairOptionally(edge, this.backend.symbolByName.Diff);
        this.backend.unlinkSymbol(edge);
        if(diffSymbol == this.backend.symbolByName.Void || this.backend.getTriple([this.backend.symbolByName.Void, this.backend.symbolByName.Diff, diffSymbol], this.backend.queryMasks.VMM))
            return;
        const diff = new Diff(this, diffSymbol);
        diff.unlink();
    }

    /** Materializes a version (checkout)
     * @param {Symbol} version The version to materialize
     * @return {RelocationTable} Relocates modal namespaces to become namespaces of the materialized version
     */
    materializeVersion(version) {
        console.assert(!this.backend.getTriple([version, this.backend.symbolByName.Materialization, this.backend.symbolByName.Void], this.backend.queryMasks.MMI));
        const path = SymbolMap.count(this.getRelatives(version, this.backend.symbolByName.Parent)) > 0 ? this.findPath(version) : undefined,
              materializationRelocation = RelocationTable.create(),
              dstMaterialization = this.backend.createSymbol(this.namespaceIdentity);
        this.backend.setTriple([version, this.backend.symbolByName.Materialization, dstMaterialization], true);
        for(const [recordingNamespaceIdentity, modalNamespaceIdentity] of Object.entries(this.relocationTable)) {
            const materializationNamespaceSymbol = this.backend.createSymbol(SymbolInternals.identityOfSymbol(this.backend.symbolByName.Namespaces));
            RelocationTable.set(materializationRelocation, modalNamespaceIdentity, SymbolInternals.identityOfSymbol(materializationNamespaceSymbol));
            this.backend.setTriple([dstMaterialization, this.backend.symbolInNamespace('Namespaces', modalNamespaceIdentity), materializationNamespaceSymbol], true);
        }
        if(path) {
            console.assert(path.length > 1);
            version = path[0].version;
            const srcMaterialization = this.backend.getPairOptionally(version, this.backend.symbolByName.Materialization),
                  cloneRelocation = RelocationTable.create();
            for(const triple of this.backend.queryTriples(this.backend.queryMasks.MVV, [srcMaterialization, this.backend.symbolByName.Void, this.backend.symbolByName.Void]))
                RelocationTable.set(cloneRelocation, SymbolInternals.identityOfSymbol(triple[2]), RelocationTable.get(materializationRelocation, SymbolInternals.identityOfSymbol(triple[1])));
            this.backend.cloneNamespaces(cloneRelocation);
            for(let i = 1; i < path.length; ++i) {
                const diff = new Diff(this, this.backend.getPairOptionally(path[i].edge, this.backend.symbolByName.Diff));
                diff.apply(path[i].direction, materializationRelocation);
                version = path[i].version;
            }
        }
        return materializationRelocation;
    }

    /** Deletes the materialization of a version, but not the version itself
     * @param {Symbol} version The version to dematerialize
     */
    dematerializeVersion(version) {
        const materialization = this.backend.getPairOptionally(version, this.backend.symbolByName.Materialization);
        if(materialization == this.backend.symbolByName.Void)
            return;
        for(const triple of this.backend.queryTriples(this.backend.queryMasks.MIV, [materialization, this.backend.symbolByName.Void, this.backend.symbolByName.Void]))
            this.backend.unlinkSymbol(triple[2]);
        this.backend.unlinkSymbol(materialization);
    }
}
