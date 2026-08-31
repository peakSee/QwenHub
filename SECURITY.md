# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please report it privately by opening a [GitHub Security Advisory](https://github.com/youssefvdel/qwenhub/security/advisories/new).

Do not report security vulnerabilities via public GitHub issues.

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fix (if known)

You should receive a response within 48 hours. If you don't, please follow up.

## Supported Versions

| Version | Supported |
|---------|-----------|
| latest  | ✅ |
| older   | ❌ |

## Scope

- The QwenHub server (`src/`)
- API authentication and authorization
- Session/cookie management
- Account credential storage
- Logging and data exposure

## Out of Scope

- Third-party dependencies (report upstream)
- Qwen/chat.qwen.ai services themselves
- Browser engine vulnerabilities
