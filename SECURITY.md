# Security Policy 🔐

SquareScope may process sensitive business and customer information.

## Never commit

- Square access tokens
- `.env.local`
- customer records
- merchant secrets
- private API responses
- production exports

## Production deployments

Deployments using real Square data should always be protected with authentication or another access-control layer.

## Credential exposure

If a Square credential is exposed:

1. Revoke or rotate it immediately.
2. Update your deployment secret.
3. Remove it from Git history if necessary.
4. Redeploy.
