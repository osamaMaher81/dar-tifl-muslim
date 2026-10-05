import {validateConfig} from '../runtime/config.mjs';
import './migrate.mjs';
validateConfig();await import('../server.js');
