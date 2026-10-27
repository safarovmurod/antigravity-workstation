'use strict';
const { generate } = require('./build-instructional-animations.cjs');
if (require.main === module) generate();
module.exports = { generate };
