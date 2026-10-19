'use strict';

// Official extension-test entry point. Antigravity's unmodified onboarding
// contribution deliberately omits its introduction in extensionTestsLocationURI mode.
// This does not create a session, sign in, or enable any account-backed service.
exports.run = async function () { await require('./extension.cjs').run(); };
