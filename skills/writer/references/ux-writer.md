# The UX Writer

For: Error messages, UI copy, notifications, empty states, button labels, tooltips, onboarding microcopy

## Voice

Helpful guide who respects the user's time. Every word costs attention. You're writing for someone in the middle of a task who needs to understand something quickly and move on.

## Characteristics

- **Brevity is king** - Say it in fewer words
- **Actionable** - Tell them what to do, not just what happened
- **No blame** - Never make the user feel stupid
- **Specific** - Vague messages are useless messages

## The Error Message Formula

Every error answers three questions:
1. **What happened?** (brief, specific)
2. **Why?** (if it helps them understand)
3. **What now?** (the action they can take)

```
Bad:  Error
Bad:  Something went wrong
Bad:  An error occurred while processing your request

Good: Upload failed. File exceeds 10MB limit.
Good: Can't connect. Check your internet and try again.
Good: Password must be at least 12 characters.
```

## Button Labels

Use verbs that describe the action:

| Bad | Good |
|-----|------|
| Submit | Save changes |
| OK | Got it |
| Cancel | Discard |
| Yes | Delete |
| Click here | View details |

Be specific about what happens:
- "Save" vs "Save draft" vs "Publish"
- "Delete" vs "Remove from list" vs "Delete permanently"

## Empty States

Don't just say "Nothing here." Help them take action:

```
Bad:  No results
Good: No results for "asdf". Try a different search term.

Bad:  No projects yet
Good: No projects yet. Create your first project to get started.
      [Create project]
```

## Notifications

Lead with the news, not the noise:

```
Bad:  Notification: Your export has completed successfully
Good: Export ready. Download now.

Bad:  Alert: There was a problem with your payment method
Good: Payment failed. Update your card to continue.
```

## Confirmation Dialogs

State the consequence, not just the action:

```
Bad:  Are you sure?
Good: Delete "Project Alpha"? This can't be undone.
      [Cancel] [Delete]

Bad:  Confirm logout
Good: You have unsaved changes. Leave without saving?
      [Stay] [Leave]
```

## Loading States

Be honest about what's happening:

```
Bad:  Loading...
Good: Saving your changes...
Good: Connecting to server...
Good: Processing 24 of 100 files...
```

## Form Validation

Validate inline. Be specific. Help them fix it:

```
Bad:  Invalid input
Good: Email must include @ symbol

Bad:  Password too weak
Good: Add a number or symbol to strengthen your password

Bad:  Invalid date
Good: Enter a date in MM/DD/YYYY format
```

## Tone Calibration

Match gravity to situation:

| Situation | Tone |
|-----------|------|
| Success | Brief, positive: "Saved" / "Done" / "Sent" |
| Info | Neutral: "Your trial ends in 3 days" |
| Warning | Direct: "This will affect all team members" |
| Error | Helpful: "Connection lost. Retrying..." |
| Critical | Clear, calm: "Your session expired. Sign in again to continue." |

Never:
- Apologize excessively ("We're so sorry!")
- Use exclamation points for errors
- Blame the user ("You entered an invalid...")
- Be cute when something's broken

## Placeholders and Labels

Labels go above fields, not inside them. Placeholders show format:

```
Email
[name@example.com]

Phone number
[(555) 123-4567]
```

Don't use placeholder as label. Don't repeat the label in the placeholder.

## Anti-Patterns

### The wall of text
```
Bad:  We encountered an unexpected error while attempting to process
      your request. Our team has been notified and is working to
      resolve the issue. Please try again later or contact support
      if the problem persists.

Good: Something went wrong. Try again, or contact support if it continues.
```

### The vague message
```
Bad:  Invalid value
Good: Price must be a positive number
```

### The blame game
```
Bad:  You entered an incorrect password
Good: Incorrect password. Try again or reset it.
```

### The false positive
```
Bad:  Success! (when nothing actually happened)
Good: [Only show success when something succeeded]
```

## Checklist

Before shipping UI copy:
- [ ] Can this be shorter?
- [ ] Does it tell them what to do next?
- [ ] Would they understand this at 2am, tired, on mobile?
- [ ] Does it avoid blame and jargon?
- [ ] Is the tone appropriate to the situation?
