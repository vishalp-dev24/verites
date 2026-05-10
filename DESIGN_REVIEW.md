# Design Review - Dashboard API Integration

## 🎨 UI/UX Assessment

### Current State
Dashboard exists with 5 panels:
- Overview: System health, recent jobs, quick stats
- Research Jobs: Job log with status
- Cost & Usage: Credit visualization
- Security: Security event log
- Test API: Research query tester

### Current Issue
All data is **static/mock**. No API integration.

### Integration Points Required

| Panel | API Endpoints Needed | Real-time? |
|-------|---------------------|------------|
| Overview | GET /api/stats | SSE for live updates |
| Jobs | GET /api/jobs, GET /api/jobs/:id | SSE for status changes |
| Cost | GET /api/credits | Long polling |
| Security | GET /api/security/events | SSE for alerts |
| Test | POST /api/research | N/A |

### Dashboard API Design

```typescript
// API routes to add to src/api/routes.ts

// Stats endpoint
GET /api/stats
{
  total_jobs: number,
  jobs_today: number,
  active_jobs: number,
  credits_remaining: number,
  avg_research_time: number
}

// Jobs endpoint
GET /api/jobs?page=1&limit=20
{
  jobs: ResearchJob[],
  total: number,
  page: number
}

// SSE for real-time updates
GET /api/events/stream
Event: job.created | job.updated | job.completed | security.alert

// Credits endpoint
GET /api/credits
{
  balance: number,
  used_this_month: number,
  tier: string
}
```

### Minimal Viable Design Changes
No UI component changes needed - just data binding:
1. Add axios HTTP client to dashboard
2. Create API service layer (`dashboard/src/lib/api.ts`)
3. Add React hooks for data fetching (`dashboard/src/hooks/useApi.ts`)
4. Wire components to real data

### Responsive Design Check
Dashboard already uses:
- Tailwind CSS
- Responsive breakpoints
- Proper spacing scales

No changes needed.

### Accessibility
Current issues:
- Missing aria-labels on some buttons
- No loading state announcements

Low priority for MVP → Production transition.

## Design Review Verdict

**Status: APPROVED**
- No new design work required
- Only API integration needed
- Suggest adding loading states and error handling

---
Reviewer: AI CDO (Chief Design Officer)
Next Step: Implementation
