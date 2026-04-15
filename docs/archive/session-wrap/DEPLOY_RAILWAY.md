# Deploy to Railway

Production deployment guide for session-wrap backend.

## Prerequisites

1. **Railway Account**: Sign up at https://railway.app
2. **GitHub**: Repository must be connected
3. **Environment Variables**: From `.env.example`

## Deployment Steps

### Option 1: Railway Dashboard (Easiest)

1. **Create Project**
   - Go to https://railway.app
   - Click "New Project"
   - Select "Deploy from GitHub"

2. **Select Repository**
   - Choose: `YD 2026` (or your fork)
   - Select branch: `master`
   - Authorize Railway with GitHub

3. **Configure Services**

   a. **PostgreSQL Database**
   - Add service → Postgres
   - Database name: `session_wrap_db`
   - User: `postgres`
   - (Railway generates password automatically)

   b. **Express Backend**
   - Add service → GitHub repo
   - Service name: `session-wrap-backend`
   - Root directory: `session-wrap-backend`

4. **Set Environment Variables**

   In Railway dashboard, go to `session-wrap-backend` service → Variables:

   ```
   NODE_ENV=production
   PORT=3000
   JWT_SECRET=[generate-random-secret-32-chars]
   CLAUDE_CODE_API_URL=https://api.claude.ai
   DATABASE_URL=[Railway generates this automatically]
   ALLOWED_ORIGINS=https://your-domain.com,http://localhost:3000
   ```

5. **Deploy**
   - Railway automatically deploys on push
   - View logs: Dashboard → Deployments → Latest

### Option 2: Railway CLI

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Link project
cd session-wrap-backend
railway link

# Set environment variables
railway variables set NODE_ENV=production
railway variables set JWT_SECRET=your-secret-here
railway variables set ALLOWED_ORIGINS=https://your-domain.com

# Deploy
railway up
```

### Option 3: Docker Registry

```bash
# Build image
docker build -t session-wrap-backend .

# Push to registry
docker push your-registry/session-wrap-backend:latest

# Deploy on Railway
# Create service from Docker image
# Set DATABASE_URL and other env vars
```

## Post-Deployment

1. **Verify Health Check**
   ```bash
   curl https://your-railway-app.railway.app/health
   ```

2. **Test Login**
   ```bash
   export CLAUDE_CODE_TOKEN=sk_...
   curl https://your-railway-app.railway.app/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"claudeToken":"sk_...","githubLogin":"user","email":"user@example.com"}'
   ```

3. **Update CLI Configuration**
   ```bash
   export SESSION_WRAP_API_URL=https://your-railway-app.railway.app
   wrap login
   wrap status
   ```

## Environment Variables (Production)

| Variable | Value | Notes |
|----------|-------|-------|
| `NODE_ENV` | `production` | Enable SSL, disable debug |
| `PORT` | `3000` | Railway assigns port automatically |
| `JWT_SECRET` | Random 32+ chars | Generate with: `openssl rand -hex 32` |
| `CLAUDE_CODE_API_URL` | `https://api.claude.ai` | Official API endpoint |
| `DATABASE_URL` | Railway PostgreSQL | Auto-generated |
| `ALLOWED_ORIGINS` | Your domain | CORS whitelist |

## Custom Domain

1. Go to Railway project settings
2. Add custom domain
3. Update DNS to point to Railway
4. Enable SSL (automatic)

## Monitoring

### View Logs
```bash
railway logs -s session-wrap-backend
```

### Monitor Performance
- CPU, memory, network in Railway dashboard
- Alerts for deployment failures
- Built-in error tracking

### Scale Up
- Increase resources in Railway dashboard
- Horizontal scaling with multiple instances
- Load balancing automatic

## Rollback

If deployment fails:

```bash
# View deployment history
railway deployments

# Redeploy previous version
railway redeploy <deployment-id>
```

## Troubleshooting

### Database Connection Error
```bash
# Verify DATABASE_URL
railway variables

# Check PostgreSQL is running
railway logs -s postgres
```

### Port Already in Use
- Railway automatically assigns ports
- Check `railway status`

### CORS Errors
- Update `ALLOWED_ORIGINS` to include your domain
- Restart service after change

## Cost

Railway pricing:
- **Free tier**: 5GB/month
- **Hobby tier**: $7 credit/month
- Database: ~$7/month for production Postgres

## Next Steps

1. Deploy backend to Railway
2. Update `SESSION_WRAP_API_URL` environment variable
3. Test with: `wrap login && wrap status`
4. Share API URL with users
5. Monitor logs and performance

---

**Estimated time**: 10-15 minutes
**Difficulty**: Easy
**Recommended**: Railway (simplest setup)
