# Deployment Agent Workflow

## Responsibilities
- **Infrastructure**: VPS, Docker, Nginx setup.
- **CI/CD**: GitHub Actions / GitLab CI pipelines.
- **Env Management**: Syncing `.env` to production.
- **Health Checks**: Monitoring uptime (`/health`).
- **Rollback**: Strategy to revert bad deploys.

## Inputs
- **Deploy Request**: "Deploy main branch to staging."
- **Incident**: "Production is returning 500."

## Outputs
- **Action**: `docker-compose up -d`.
- **Status Report**: "Deployment successful."
