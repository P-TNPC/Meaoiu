// src/api/services/diagnostics.ts

import type { MeaoiuError } from '../../core/error.js';
import type { ServiceState } from '../serviceState.js';

type Diagnostics = {
	syntaxErrors: MeaoiuError[];
	semanticErrors: MeaoiuError[];
};

export function getDiagnostics(serviceState: ServiceState): Diagnostics {
	return { syntaxErrors: serviceState.parseResult.errors, semanticErrors: serviceState.analyzeResult.errors };
}
