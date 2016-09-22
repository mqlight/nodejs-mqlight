'use strict';

module.exports = {
  extends: 'xo',
  rules: {
    'complexity': 0,
    'curly': 0,
    'indent': [2, 2, {SwitchCase: 1}],
    'max-depth': 0,
    'max-len': [1, 80, 4, {ignoreComments: true, ignoreUrls: true}],
    'max-params': 0,
    'new-cap': ['error', { 'capIsNewExceptions': ['RefreshSettled'] }],
    'no-warning-comments': 0,
    'require-jsdoc': 1,
    'space-before-function-paren': [2, 'never'],
    'valid-jsdoc': [2, {requireReturn: false, prefer: {returns: 'return'}}],
  }
};
