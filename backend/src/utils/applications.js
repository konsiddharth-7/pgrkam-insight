export const STATUSES = [
  'Applied',
  'Under Review',
  'Shortlisted',
  'Accepted',
  'Placed',
  'Rejected',
];

// The normal path an application follows
const FORWARD = ['Applied', 'Under Review', 'Shortlisted', 'Accepted', 'Placed'];

// Returns an error message, or null when the move is allowed
export function checkTransition(from, to) {
  if (from === to) return Application is already ${from};
  if (from === 'Placed' || from === 'Rejected') {
    return Application is ${from} and can no longer change;
  }
  if (to === 'Rejected') return null; // allowed from any open step
  if (FORWARD.indexOf(to) > FORWARD.indexOf(from)) return null;
  return Status cannot move backwards from ${from} to ${to};
}

// What we load with an application
export const APPLICATION_INCLUDE = {
  jobs: {
    select: {
      id: true,
      title: true,
      company: true,
      location: true,
      category: true,
      status: true,
    },
  },
};

// Admin view also loads the candidate (never the password hash)
export const ADMIN_APPLICATION_INCLUDE = {
  ...APPLICATION_INCLUDE,
  users: { select: { id: true, name: true, email: true } },
};

export function shapeApplication(a) {
  const out = {
    id: a.id,
    job_id: a.job_id,
    recommendation_id: a.recommendation_id,
    status: a.status,
    applied_at: a.applied_at,
    updated_at: a.updated_at,
  };
  if (a.jobs) out.job = a.jobs;
  if (a.users) out.candidate = a.users;
  return out;
}