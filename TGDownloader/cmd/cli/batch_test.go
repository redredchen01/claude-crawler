package main

import (
	"bytes"
	"io"
	"strings"
	"testing"
)

// TestParseURLs verifies batch URL parsing
func TestParseURLs(t *testing.T) {
	tests := []struct {
		input       string
		expectedLen int
		expectErr   bool
	}{
		{
			input: `https://t.me/channel/123
https://t.me/s/other/456
# comment line
`,
			expectedLen: 2,
			expectErr:   false,
		},
		{
			input:       "",
			expectedLen: 0,
			expectErr:   false,
		},
		{
			input: `invalid line without t.me
https://t.me/valid/789`,
			expectedLen: 1,
			expectErr:   false,
		},
		{
			input: `# comment
# another comment`,
			expectedLen: 0,
			expectErr:   false,
		},
	}

	for i, tt := range tests {
		reader := strings.NewReader(tt.input)
		urls, err := parseURLs(reader)
		if (err != nil) != tt.expectErr {
			t.Errorf("Test %d: parseURLs error = %v, wantErr %v", i, err, tt.expectErr)
			continue
		}
		if len(urls) != tt.expectedLen {
			t.Errorf("Test %d: parseURLs got %d URLs, want %d", i, len(urls), tt.expectedLen)
		}
	}
}

// TestParseURLsWithValidation verifies that only t.me URLs are accepted
func TestParseURLsFiltering(t *testing.T) {
	input := `https://t.me/channel/1
https://example.com/fake
t.me/s/valid/2
random text with t.me/ in middle
`

	reader := strings.NewReader(input)
	urls, err := parseURLs(reader)
	if err != nil {
		t.Fatalf("parseURLs error: %v", err)
	}

	// Should have 2 valid URLs
	if len(urls) != 2 {
		t.Errorf("parseURLs got %d URLs, want 2", len(urls))
	}

	// Verify all URLs contain t.me
	for _, url := range urls {
		if !strings.Contains(url, "t.me/") {
			t.Errorf("parseURLs returned invalid URL: %q", url)
		}
	}
}

// TestParseURLsIO verifies io.Reader interface works
func TestParseURLsIOInterface(t *testing.T) {
	data := []byte(`https://t.me/test/123
https://t.me/test/456`)
	reader := bytes.NewReader(data)

	urls, err := parseURLs(reader)
	if err != nil {
		t.Fatalf("parseURLs with bytes.Reader failed: %v", err)
	}

	if len(urls) != 2 {
		t.Errorf("parseURLs got %d URLs, want 2", len(urls))
	}
}
