import { execSync } from "child_process";

interface Patron {
	name: string;
	regex: RegExp;
}

const PATTERNS: Patron[] = [
	{ name: "URL con credenciales embebidas", regex: /:\/\/[^\s'"/:@]+:[^\s'"/@]+@/ },
	{ name: "password/pwd hardcodeada", regex: /\b(password|pwd|passwd)\s*[:=]\s*['"][^'"\n]{4,}['"]/i },
	{ name: "AWS Access Key", regex: /AKIA[0-9A-Z]{16}/ },
	{ name: "Private key", regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
	{ name: "Bearer token hardcodeado", regex: /Bearer\s+[A-Za-z0-9\-._~+/]{20,}/ },
];

const IGNORED_FILES_POR_DEFECTO = [".env.example"];

// Corre contra el diff staged del repo consumidor (no el de este paquete), asi
// que "extraIgnored" es para que cada repo excluya sus propios falsos positivos
// (por ejemplo un fixture con credenciales de prueba).
export function checkSecrets(extraIgnored: string[] = []): void {
	const ignoredFiles = [...IGNORED_FILES_POR_DEFECTO, ...extraIgnored];
	const staged = execSync("git diff --cached --name-only --diff-filter=ACM", { encoding: "utf8" })
		.split("\n")
		.filter(Boolean)
		.filter((f) => !ignoredFiles.includes(f));

	const problems: string[] = [];

	for (const file of staged) {
		let diff: string;
		try {
			diff = execSync(`git diff --cached -U0 -- "${file}"`, { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
		} catch {
			continue;
		}
		const addedLines = diff.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++"));
		for (const line of addedLines) {
			for (const { name, regex } of PATTERNS) {
				if (regex.test(line)) {
					problems.push(`${file}: posible ${name} -> ${line.trim().slice(0, 120)}`);
				}
			}
		}
	}

	if (problems.length > 0) {
		console.error("\nCommit bloqueado: se detectaron posibles credenciales en el diff.\n");
		problems.forEach((p) => console.error("  - " + p));
		console.error("\nSi es un falso positivo, movelo a .env o agregalo a los extraIgnored del wrapper local.\n");
		process.exit(1);
	}
}
