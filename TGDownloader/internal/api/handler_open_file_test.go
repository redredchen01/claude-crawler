package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"go.uber.org/zap"
)

func TestOpenFile_Success(t *testing.T) {
	// Create a temporary test file
	tmpDir := t.TempDir()
	testFile := filepath.Join(tmpDir, "test.txt")
	if err := os.WriteFile(testFile, []byte("test content"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	// Create handler with nil database (not needed for this test)
	handler := &Handler{
		db:     nil,
		redis:  nil,
		logger: zap.NewNop(),
	}

	// Create request
	reqBody := struct {
		FilePath string `json:"file_path"`
	}{
		FilePath: testFile,
	}
	bodyBytes, _ := json.Marshal(reqBody)

	req := httptest.NewRequest("POST", "/open-file", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")

	// Add user context to request
	ctx := context.WithValue(req.Context(), UserIDKey, int64(1))
	req = req.WithContext(ctx)

	// Record response
	w := httptest.NewRecorder()

	// Call handler
	handler.OpenFile(w, req)

	// Verify response
	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}

	var resp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&resp)

	if success, ok := resp["success"].(bool); !ok || !success {
		t.Errorf("Expected success=true in response")
	}
}

func TestOpenFile_FileNotFound(t *testing.T) {
	handler := &Handler{
		db:     nil,
		redis:  nil,
		logger: zap.NewNop(),
	}

	reqBody := struct {
		FilePath string `json:"file_path"`
	}{
		FilePath: "/nonexistent/path/to/file.txt",
	}
	bodyBytes, _ := json.Marshal(reqBody)

	req := httptest.NewRequest("POST", "/open-file", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")

	ctx := context.WithValue(req.Context(), UserIDKey, int64(1))
	req = req.WithContext(ctx)

	w := httptest.NewRecorder()
	handler.OpenFile(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("Expected status 404, got %d", w.Code)
	}
}

func TestOpenFile_NoUserContext(t *testing.T) {
	handler := &Handler{
		db:     nil,
		redis:  nil,
		logger: zap.NewNop(),
	}

	reqBody := struct {
		FilePath string `json:"file_path"`
	}{
		FilePath: "/some/path",
	}
	bodyBytes, _ := json.Marshal(reqBody)

	req := httptest.NewRequest("POST", "/open-file", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	// No user context added

	w := httptest.NewRecorder()
	handler.OpenFile(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("Expected status 500, got %d", w.Code)
	}
}

func TestOpenFile_EmptyFilePath(t *testing.T) {
	handler := &Handler{
		db:     nil,
		redis:  nil,
		logger: zap.NewNop(),
	}

	reqBody := struct {
		FilePath string `json:"file_path"`
	}{
		FilePath: "",
	}
	bodyBytes, _ := json.Marshal(reqBody)

	req := httptest.NewRequest("POST", "/open-file", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")

	ctx := context.WithValue(req.Context(), UserIDKey, int64(1))
	req = req.WithContext(ctx)

	w := httptest.NewRecorder()
	handler.OpenFile(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", w.Code)
	}
}
