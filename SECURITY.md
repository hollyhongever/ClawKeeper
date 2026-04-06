<!-- markdownlint-disable MD041 -->
## Security

ClawKeeper uses risk-based security disclosure.
Not every security-related report needs a private channel, but exploitable vulnerabilities should not be posted publicly first.

If a report is opened publicly and turns out to contain exploit-ready details, maintainers may limit discussion and move coordination into a private workflow.

## How to Report a Vulnerability

Choose the reporting path based on impact and exploitability.

### GitHub Private Vulnerability Reporting

If private vulnerability reporting is enabled for this repository, use the **Security** tab and select **Report a vulnerability**.
Use this path for issues such as:

- credential or secret exposure
- authentication bypass
- sandbox escape or privilege escalation
- remote code execution
- practical data exfiltration paths
- vulnerabilities that would put active deployments at clear risk if disclosed immediately

### Maintainer Contact on GitHub

If the private reporting flow is not available, contact the repository maintainers directly on GitHub and request a private coordination path for high-risk issues.

### Public GitHub Issues

For lower-risk or non-exploitable security issues, public GitHub issues are acceptable.
This includes topics such as:

- hardening gaps
- detection false positives or false negatives
- low-impact policy mistakes
- documentation problems in security guidance
- non-sensitive security improvement suggestions

Do not post secrets, tokens, private logs, or step-by-step exploit material in a public issue.

### Upstream Coordination

If the issue appears to originate in upstream OpenShell, NemoClaw, OpenClaw, or another third-party dependency rather than ClawKeeper-specific code, coordinate disclosure with the upstream project or vendor as well.

## What to Include

Provide as much of the following information as possible:

- Product name and version or branch that contains the vulnerability.
- Type of vulnerability (code execution, denial of service, buffer overflow, privilege escalation, etc.).
- Step-by-step instructions to reproduce the vulnerability.
- Proof-of-concept or exploit code.
- Potential impact, including how an attacker could exploit the vulnerability.

Detailed reports help maintainers reproduce and address issues faster.

## What to Expect

After submission, maintainers will attempt to:

1. Acknowledge receipt and begin triage.
2. Validate the report and estimate impact.
3. Decide whether the issue should stay public or move to a private workflow.
4. Develop, test, and coordinate a fix.
5. Publish the fix or disclosure notes when coordinated release is ready.

For high-risk issues, please avoid public disclosure until maintainers have had a reasonable chance to investigate and coordinate remediation.

## Scope Notes

- High-risk ClawKeeper-specific vulnerabilities should be reported privately first.
- Lower-risk ClawKeeper-specific security issues may be reported publicly.
- Upstream issues should also be shared with the upstream project or vendor.
- Public exploit details should wait until a fix or mitigation is available.
