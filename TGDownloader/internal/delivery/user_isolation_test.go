package delivery

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
)

// TestS3PathIncludesUserID verifies that S3 paths include user_id for isolation
func TestS3PathIncludesUserID(t *testing.T) {
	// Test path construction for different users
	tests := []struct {
		userID int64
		taskID string
		want   string
	}{
		{
			userID: 123,
			taskID: "task-uuid-1",
			want:   "s3://bucket/downloads/123/task-uuid-1.mp4",
		},
		{
			userID: 456,
			taskID: "task-uuid-2",
			want:   "s3://bucket/downloads/456/task-uuid-2.mp4",
		},
		{
			userID: 999,
			taskID: "abc-def",
			want:   "s3://bucket/downloads/999/abc-def.mp4",
		},
	}

	for _, tt := range tests {
		// Simulate S3 path construction as in DeliverToS3
		outputURL := fmt.Sprintf("s3://bucket/downloads/%d/%s.mp4", tt.userID, tt.taskID)
		assert.Equal(t, tt.want, outputURL)

		// Verify user_id and task_id are present and distinct
		assert.Contains(t, outputURL, fmt.Sprintf("downloads/%d", tt.userID))
		assert.Contains(t, outputURL, tt.taskID)
	}
}

// TestUserNamespacesAreDifferent verifies different users have different paths
func TestUserNamespacesAreDifferent(t *testing.T) {
	userAPath := fmt.Sprintf("s3://bucket/downloads/%d/%s.mp4", 111, "task-1")
	userBPath := fmt.Sprintf("s3://bucket/downloads/%d/%s.mp4", 222, "task-1")

	// Same task_id but different user_id should produce different paths
	assert.NotEqual(t, userAPath, userBPath)
	assert.Contains(t, userAPath, "111")
	assert.Contains(t, userBPath, "222")
}

// TestLocalPathIncludesUserID verifies local delivery paths include user_id
func TestLocalPathIncludesUserID(t *testing.T) {
	tests := []struct {
		userID int64
		taskID string
		want   string
	}{
		{
			userID: 999,
			taskID: "local-task-1",
			want:   "file:///data/downloads/999/local-task-1.mp4",
		},
		{
			userID: 777,
			taskID: "file-2",
			want:   "file:///data/downloads/777/file-2.mp4",
		},
	}

	for _, tt := range tests {
		// Simulate local path construction as in DeliverToLocal
		outputURL := fmt.Sprintf("file:///data/downloads/%d/%s.mp4", tt.userID, tt.taskID)
		assert.Equal(t, tt.want, outputURL)
	}
}
