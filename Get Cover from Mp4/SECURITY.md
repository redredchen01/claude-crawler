# Security Policy

## Reporting Security Vulnerabilities

If you discover a security vulnerability in Cover Selector, please report it responsibly by emailing noreply@github.com with the following information:

1. **Description** — What is the vulnerability and its potential impact?
2. **Location** — Which file(s) and line(s) are affected?
3. **Reproduction** — Steps to reproduce (if applicable)
4. **Severity** — Your assessment of severity (low, medium, high, critical)

**Do not** open a public GitHub issue for security vulnerabilities. This helps us fix the issue before attackers can exploit it.

## Response Timeline

- **Acknowledgement** — Within 24 hours
- **Assessment** — Within 5 business days
- **Fix & Release** — As soon as feasible based on severity
- **Disclosure** — After a fix is released, or 90 days from report, whichever comes first

## Security Considerations

### Local-Only Architecture
Cover Selector runs entirely on your local machine. No data is transmitted to external servers:
- Video processing happens locally
- All dependencies are open-source and auditable
- No remote API calls for core functionality

### Dependency Security
- We actively monitor dependencies for known vulnerabilities
- Dependencies are kept up-to-date when security patches are available
- See `pyproject.toml` for the full dependency list

### Input Validation
- Video files are validated before processing
- Only standard video codecs (H.264, VP9, etc.) are supported

## Security Limitations

Cover Selector is designed as a **local utility**, not a service for handling sensitive data:
- It does not store encrypted data
- It does not handle authentication or authorization
- Do not use it to process videos containing sensitive or confidential information without first securing your environment

## Resources

- [OWASP Security Guidelines](https://owasp.org/)
- [Python Security Best Practices](https://python.readthedocs.io/en/stable/library/security_warnings.html)
- [OpenCV Security](https://docs.opencv.org/)

---

Thank you for helping keep Cover Selector secure! 🛡️
