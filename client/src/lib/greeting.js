// Picks a warm, personalized greeting + supportive subline for the dashboard
// based on the member's state.
export function getGreeting({ preStart, day, totalValue, status }) {
  if (preStart) return { titleKey: 'greetWelcomePreStart', subKey: 'encPreStart' };
  if (totalValue === 0 && day === 1) return { titleKey: 'greetWelcome', subKey: 'encWelcome' };
  if (status === 'completed') return { titleKey: 'greetFinished', subKey: 'encFinished' };
  if (status === 'on_track') return { titleKey: 'greetOnTrack', subKey: 'encOnTrack' };
  if (status === 'falling_behind') return { titleKey: 'greetFallingBehind', subKey: 'encFallingBehind' };
  if (status === 'inactive') return { titleKey: 'greetInactive', subKey: 'encInactive' };
  return { titleKey: 'greetDefault', subKey: 'encDefault' };
}