import { createRequire } from 'module';
class BunDatabaseAdapter {
    db;
    constructor(path) {
        const { Database } = require('bun:sqlite');
        this.db = new Database(path);
    }
    exec(sql) {
        this.db.exec(sql);
    }
    prepare(sql) {
        const stmt = this.db.query(sql);
        return {
            all: (...params) => stmt.all(...params),
            get: (...params) => stmt.get(...params),
            run: (...params) => stmt.run(...params),
        };
    }
    close() {
        this.db.close();
    }
}
class NodeDatabaseAdapter {
    db;
    constructor(path) {
        const requireFunc = createRequire(import.meta.url);
        const Database = requireFunc('better-sqlite3');
        this.db = new Database(path);
    }
    exec(sql) {
        this.db.exec(sql);
    }
    prepare(sql) {
        const stmt = this.db.prepare(sql);
        return {
            all: (...params) => stmt.all(...params),
            get: (...params) => stmt.get(...params),
            run: (...params) => stmt.run(...params),
        };
    }
    close() {
        this.db.close();
    }
}
export class UnifiedDatabase {
    adapter;
    constructor(path) {
        if (process.versions.bun) {
            this.adapter = new BunDatabaseAdapter(path);
        }
        else {
            this.adapter = new NodeDatabaseAdapter(path);
        }
    }
    exec(sql) {
        return this.adapter.exec(sql);
    }
    prepare(sql) {
        return this.adapter.prepare(sql);
    }
    close() {
        return this.adapter.close();
    }
}
