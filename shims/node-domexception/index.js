"use strict";
// Node.js 16+ exposes DOMException as a global; no polyfill required.
// This shim replaces the deprecated `node-domexception` registry package
// to silence the npm deprecation warning during installation.
module.exports = globalThis.DOMException;
