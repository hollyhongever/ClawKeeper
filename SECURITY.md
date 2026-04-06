<!-- markdownlint-disable MD041 -->
## Security

ClawKeeper security reports should be handled privately.
Do not report suspected vulnerabilities through public GitHub issues, pull requests, or discussions.

If a potential vulnerability is accidentally reported through a public channel, maintainers may limit public discussion and redirect the report into a private workflow.

## How to Report a Vulnerability

Report a potential vulnerability in ClawKeeper through one of the following channels.

### GitHub Private Vulnerability Reporting

If private vulnerability reporting is enabled for this repository, use the **Security** tab and select **Report a vulnerability**.
This is the preferred reporting path because it keeps discussion, reproduction details, and patch coordination private.

### Maintainer Contact on GitHub

If the private reporting flow is not available, contact the repository maintainers directly on GitHub before public disclosure and request a private coordination path.

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
3. Develop, test, and coordinate a fix.
4. Publish the fix or disclosure notes when coordinated release is ready.

Please avoid public disclosure until maintainers have had a reasonable chance to investigate and coordinate remediation.

## Scope Notes

- ClawKeeper-specific issues should be reported here.
- Upstream issues should also be shared with the upstream project or vendor.
- Public exploit details should wait until a fix or mitigation is available.
