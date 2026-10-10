# Go Testing Patterns

Language-specific patterns for testing Go applications using the standard library, `testify`, and modern integration tools. Layout rules (external test packages, map tables, what to mock) live in the **go-style** skill; this file shows the mechanics. Follow the repo's assertion conventions where they differ from the examples.

## Contents

- [Assertion Strategy](#assertion-strategy)
- [Table-Driven Tests](#table-driven-tests-the-gold-standard)
- [Integration Testing (Testcontainers)](#integration-testing-testcontainers)
- [Mocking Strategies](#mocking-strategies)
- [Native Fuzzing](#native-fuzzing)
- [HTTP Handlers with httptest](#http-handlers-with-httptest)
- [Tooling Quick Reference](#tooling-quick-reference)

## Assertion Strategy

- **Use `testify/require` by default.** A failed check stops the test, so later lines never run against bad state or pile on follow-on failures.
- **Use `google/go-cmp` for structs and slices.** One `cmp.Diff` replaces a run of field-by-field checks and shows exactly which field differs.
- **Use `testify/assert` only when several independent checks each say something on their own**, such as every header on a response, where seeing all mismatches at once saves reruns.

```go
package user_test

import (
    "testing"
    "github.com/stretchr/testify/require"
    "github.com/google/go-cmp/cmp"

    "example.com/app/user"
)

func TestUserProcessing(t *testing.T) {
    // SETUP
    // Use 'require' to fail fast if setup fails
    u, err := user.Create("test@example.com")
    require.NoError(t, err, "Setup failed, stopping test")
    require.NotNil(t, u)

    // ACTION
    processedUser := user.Process(u)

    // ASSERTIONS
    require.Equal(t, "processed", processedUser.Status)
    require.True(t, processedUser.IsActive)

    // Use 'go-cmp' for complex objects
    // Testify's output for large structs can be unreadable.
    // cmp.Diff shows exactly which field differs (-want +got)
    want := user.User{
        Email:    "test@example.com",
        Status:   "processed",
        IsActive: true,
        Metadata: map[string]string{"source": "web"},
    }

    if diff := cmp.Diff(want, processedUser); diff != "" {
        t.Errorf("Process() mismatch (-want +got):\n%s", diff)
    }
}
```

## Table-Driven Tests (The Gold Standard)

This is the dominant pattern in Go. Key the table by case name with a map. If a test can be made parallel without being flaky, combine it with `t.Parallel()` for speed. Map iteration order is random, which exposes cases that depend on each other, and duplicate case names fail to compile.

```go
func TestParseURL(t *testing.T) {
    tests := map[string]struct {
        input   string
        want    string // simplified for example
        wantErr string // use string to match partial error messages
    }{
        "valid http": {
            input: "http://example.com",
            want:  "example.com",
        },
        "missing protocol": {
            input:   "example.com",
            wantErr: "invalid URL",
        },
    }

    for name, tc := range tests {
        t.Run(name, func(t *testing.T) {
            t.Parallel()

            got, err := urlparse.Parse(tc.input)

            if tc.wantErr != "" {
                require.Error(t, err)
                require.Contains(t, err.Error(), tc.wantErr)
                return
            }

            require.NoError(t, err)
            require.Equal(t, tc.want, got)
        })
    }
}
```

## Integration Testing (Testcontainers)

Do not mock database drivers. It creates low-confidence tests. Use `testcontainers-go` to spin up real dependencies.

```go
import (
    "context"
    "testing"
    "github.com/testcontainers/testcontainers-go/modules/postgres"
    "github.com/stretchr/testify/require"
)

func TestUserDAO(t *testing.T) {
    if testing.Short() {
        t.Skip("Skipping integration test")
    }

    ctx := context.Background()

    // Spin up real Postgres
    pgContainer, err := postgres.Run(ctx, "docker.io/postgres:16-alpine",
        postgres.WithDatabase("testdb"),
        postgres.WithUsername("user"),
        postgres.WithPassword("password"),
    )
    require.NoError(t, err)

    // Clean up container when test ends
    t.Cleanup(func() {
        pgContainer.Terminate(ctx)
    })

    // Get connection string and run assertions
    connStr, _ := pgContainer.ConnectionString(ctx, "sslmode=disable")
    // ... connect to DB and test ...
}
```

## Mocking Strategies

Mock only what sits outside the repo: other services, vendor clients, and infrastructure (pubsub, clock, flags). Use a real database. Never mock the repo's own packages.

### 1. Generated Mocks (Most Common)

Where the repo already uses `go.uber.org/mock`, follow it. The client package declares a small interface type and a `go:generate` directive, and tests use the generated mock.

```go
// pkg/emailclient/emailclient.go
//go:generate go tool mockgen -source=emailclient.go -destination=../mockemailclient/mockemailclient.go -typed -package=mockemailclient

type Client interface {
    Send(ctx context.Context, to, msg string) error
}
```

```go
func TestRegistration(t *testing.T) {
    ctrl := gomock.NewController(t)
    email := mockemailclient.NewMockClient(ctrl)
    svc := registration.NewService(email)

    email.EXPECT().Send(gomock.Any(), "user@example.com", gomock.Any()).Return(nil)

    require.NoError(t, svc.Register(t.Context(), "user@example.com"))
}
```

### 2. Handwritten Fakes

In repos without a mock generator, a small fake for the boundary client is cleaner than a mock framework. It is type-safe and refactor-friendly.

```go
type fakeSender struct {
    sent []string
}

func (f *fakeSender) Send(_ context.Context, to, _ string) error {
    f.sent = append(f.sent, to)
    return nil
}

func TestRegistration(t *testing.T) {
    fake := &fakeSender{}
    svc := registration.NewService(fake)

    require.NoError(t, svc.Register(t.Context(), "user@example.com"))

    require.Equal(t, []string{"user@example.com"}, fake.sent)
}
```

## Native Fuzzing

Use standard library fuzzing for parsers and validators. It finds edge cases (empty bytes, huge inputs) that humans miss.

```go
func FuzzJSONParser(f *testing.F) {
    f.Add("{\"foo\":\"bar\"}") // Seed corpus

    f.Fuzz(func(t *testing.T, jsonInput string) {
        val, err := Parse(jsonInput)

        if err == nil {
            // Property: Re-encoding should match input
            output, _ := Marshal(val)
            if jsonInput != output {
                t.Errorf("Roundtrip failure! Input: %q, Output: %q", jsonInput, output)
            }
        }
    })
}
```

## HTTP Handlers with `httptest`

```go
func TestHandleHealth(t *testing.T) {
    // Arrange
    req := httptest.NewRequest("GET", "/health", nil)
    w := httptest.NewRecorder()

    // Act
    HealthHandler(w, req)

    // Assert
    res := w.Result()
    require.Equal(t, 200, res.StatusCode)

    body, err := io.ReadAll(res.Body)
    require.NoError(t, err)
    require.JSONEq(t, `{"status": "ok"}`, string(body))
}
```

## Tooling Quick Reference

| Tool                | Purpose        | Best Use Case                                   |
| ------------------- | -------------- | ----------------------------------------------- |
| **testify/require** | Assertions     | The default for every check.                    |
| **testify/assert**  | Assertions     | Independent checks worth reporting together.    |
| **google/go-cmp**   | Comparison     | Complex structs, huge slices, map diffs.        |
| **testcontainers**  | Infrastructure | Database/Cache integration tests.               |
| **httptest**        | HTTP           | Testing API handlers without starting a server. |
| **testing.F**       | Fuzzing        | Robustness testing for inputs/parsers.          |
