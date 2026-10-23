import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Read both npm and Yarn 3 reports. Yarn can exit successfully with findings. */
export function auditFindings(report) {
    if (report?.error) {
        throw new Error(
            `Dependency audit failed: ${report.error.code}: ${
                report.error.summary || report.error.message || 'unknown error'
            }`
        );
    }
    if (!report || !report.metadata?.vulnerabilities) {
        throw new Error('Missing or failed dependency audit report');
    }
    const counts = report.metadata.vulnerabilities;
    for (const severity of ['info', 'low', 'moderate', 'high', 'critical']) {
        if (!Number.isSafeInteger(counts[severity]) || counts[severity] < 0) {
            throw new Error(`Invalid audit count: ${severity}`);
        }
    }
    if (report.muted?.length) throw new Error('Muted advisories are not permitted');
    let findings;
    if (report.advisories && typeof report.advisories === 'object' && !Array.isArray(report.advisories)) {
        findings = Object.values(report.advisories).map(
            advisory => `${advisory.module_name}: ${advisory.github_advisory_id || advisory.url}`
        );
    } else if (
        report.auditReportVersion === 2 &&
        report.vulnerabilities &&
        typeof report.vulnerabilities === 'object' &&
        !Array.isArray(report.vulnerabilities)
    ) {
        findings = Object.keys(report.vulnerabilities);
    } else {
        throw new Error('Unrecognized dependency audit format');
    }
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    if (total && !findings.length) findings.push(`${total} reported vulnerabilities`);
    return findings;
}

export function auditDependencies() {
    const root = fileURLToPath(new URL('../', import.meta.url));
    const audits = [
        { name: 'Plugin', command: 'npm', args: ['audit', '--json', '--ignore-scripts'], cwd: root },
        {
            name: 'Vendored client',
            command: process.execPath,
            args: ['.yarn/releases/yarn-3.6.0.cjs', 'npm', 'audit', '--recursive', '--json'],
            cwd: fileURLToPath(new URL('../vendor/hypothesis-client/', import.meta.url))
        }
    ];
    const env = { ...process.env };
    // npm 11 exports allow-scripts into lifecycle subprocesses, then rejects
    // that CLI-only setting on nested project commands. This read-only audit
    // explicitly disables scripts and does not need the lifecycle setting.
    delete env.npm_config_allow_scripts;
    for (const audit of audits) {
        const result = spawnSync(audit.command, audit.args, {
            cwd: audit.cwd,
            env,
            encoding: 'utf8',
            timeout: 120_000,
            maxBuffer: 16 * 1024 * 1024
        });
        if (result.error || result.signal) throw result.error || new Error(`${audit.name} audit was interrupted`);
        let report;
        try {
            report = JSON.parse(result.stdout);
        } catch {
            throw new Error(`${audit.name} audit did not return valid JSON: ${result.stderr.trim()}`);
        }
        const findings = auditFindings(report);
        if (findings.length) throw new Error(`${audit.name} dependency advisories:\n${findings.join('\n')}`);
        if (result.status !== 0) throw new Error(`${audit.name} audit exited with status ${result.status}`);
        console.log(`${audit.name}: zero dependency advisories`);
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    try {
        auditDependencies();
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
