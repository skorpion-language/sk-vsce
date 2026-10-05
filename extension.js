// extension.js
const { activateSkorpion } = require('./skorpion');
const { activateSpc } = require('./spc');

function activate(context) {
    console.log('[sk-vsce] ACTIVATED');

    activateSkorpion(context);
    activateSpc(context);
}

function deactivate() {
    console.log('[sk-vsce] DEACTIVATED');
}

module.exports = { activate, deactivate };