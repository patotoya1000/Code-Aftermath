import { createApp } from './src/app/index.js';

const app = createApp();
const result = await app.runLesson('m1_first_wood', 'survivor.gather("wood", 10);');
console.log('passed', result.evaluation.passed);
console.log('feedback', result.evaluation.feedback);
console.log('sandbox', result.attempt.sandbox);
console.log('commands', result.attempt.commands.length);
