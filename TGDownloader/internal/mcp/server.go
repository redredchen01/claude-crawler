package mcp

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"sync"
)

// FlushableWriter can flush output
type FlushableWriter interface {
	io.Writer
	Flush() error
}

// Server implements a basic MCP (Model Context Protocol) server
type Server struct {
	stdin   io.Reader
	stdout  io.Writer
	writer  *bufio.Writer
	logger  *log.Logger

	// Tool registry
	tools    map[string]*Tool
	toolsMu  sync.RWMutex
	handlers map[string]ToolHandler

	// JSON-RPC handling
	nextID int
	idMu   sync.Mutex
}

// Tool represents an MCP tool definition
type Tool struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	InputSchema map[string]interface{} `json:"inputSchema"`
}

// ToolHandler is called when a tool is invoked
type ToolHandler func(args map[string]interface{}) (interface{}, error)

// NewServer creates a new MCP server
func NewServer() *Server {
	writer := bufio.NewWriter(os.Stdout)
	return &Server{
		stdin:    os.Stdin,
		stdout:   os.Stdout,
		writer:   writer,
		logger:   log.New(os.Stderr, "[MCP] ", log.LstdFlags),
		tools:    make(map[string]*Tool),
		handlers: make(map[string]ToolHandler),
	}
}

// RegisterTool registers a new tool with the server
func (s *Server) RegisterTool(tool *Tool, handler ToolHandler) {
	s.toolsMu.Lock()
	defer s.toolsMu.Unlock()

	s.tools[tool.Name] = tool
	s.handlers[tool.Name] = handler
	s.logger.Printf("Registered tool: %s", tool.Name)
}

// GetTools returns all registered tools
func (s *Server) GetTools() []*Tool {
	s.toolsMu.RLock()
	defer s.toolsMu.RUnlock()

	tools := make([]*Tool, 0, len(s.tools))
	for _, tool := range s.tools {
		tools = append(tools, tool)
	}
	return tools
}

// Run starts the MCP server and processes incoming messages
func (s *Server) Run() error {
	s.logger.Println("Starting MCP server...")

	scanner := bufio.NewScanner(s.stdin)
	for scanner.Scan() {
		line := scanner.Text()

		// Parse JSON-RPC message
		var msg map[string]interface{}
		if err := json.Unmarshal([]byte(line), &msg); err != nil {
			s.logger.Printf("Failed to parse message: %v", err)
			continue
		}

		// Handle based on message type
		if method, ok := msg["method"].(string); ok {
			go s.handleMethod(method, msg)
		} else {
			s.logger.Printf("Invalid message format: %v", msg)
		}
	}

	if err := scanner.Err(); err != nil {
		return fmt.Errorf("scanner error: %w", err)
	}

	return nil
}

// handleMethod processes incoming method calls
func (s *Server) handleMethod(method string, msg map[string]interface{}) {
	id := msg["id"]

	switch method {
	case "initialize":
		s.handleInitialize(id, msg)
	case "tools/list":
		s.handleToolsList(id, msg)
	case "tools/call":
		s.handleToolCall(id, msg)
	default:
		s.sendError(id, -32601, fmt.Sprintf("Unknown method: %s", method))
	}
}

// handleInitialize processes initialization request
func (s *Server) handleInitialize(id interface{}, msg map[string]interface{}) {
	response := map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      id,
		"result": map[string]interface{}{
			"protocolVersion": "2024-11-05",
			"capabilities": map[string]interface{}{
				"tools": map[string]interface{}{},
			},
			"serverInfo": map[string]interface{}{
				"name":    "tgdownloader-mcp",
				"version": "0.1.0",
			},
		},
	}

	s.sendJSON(response)
}

// handleToolsList returns list of available tools
func (s *Server) handleToolsList(id interface{}, msg map[string]interface{}) {
	tools := s.GetTools()
	toolList := make([]map[string]interface{}, len(tools))

	for i, tool := range tools {
		toolList[i] = map[string]interface{}{
			"name":        tool.Name,
			"description": tool.Description,
			"inputSchema": tool.InputSchema,
		}
	}

	response := map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      id,
		"result": map[string]interface{}{
			"tools": toolList,
		},
	}

	s.sendJSON(response)
}

// handleToolCall handles tool invocation
func (s *Server) handleToolCall(id interface{}, msg map[string]interface{}) {
	params, ok := msg["params"].(map[string]interface{})
	if !ok {
		s.sendError(id, -32602, "Invalid params format")
		return
	}

	toolName, ok := params["name"].(string)
	if !ok {
		s.sendError(id, -32602, "Tool name required")
		return
	}

	toolArgs, ok := params["arguments"].(map[string]interface{})
	if !ok {
		toolArgs = make(map[string]interface{})
	}

	// Get and call handler
	s.toolsMu.RLock()
	handler, exists := s.handlers[toolName]
	s.toolsMu.RUnlock()

	if !exists {
		s.sendError(id, -32601, fmt.Sprintf("Tool not found: %s", toolName))
		return
	}

	result, err := handler(toolArgs)
	if err != nil {
		s.sendError(id, -32603, fmt.Sprintf("Tool execution failed: %v", err))
		return
	}

	response := map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      id,
		"result": map[string]interface{}{
			"content": []map[string]interface{}{
				{
					"type": "text",
					"text": fmt.Sprintf("%v", result),
				},
			},
		},
	}

	s.sendJSON(response)
}

// sendJSON sends a JSON response
func (s *Server) sendJSON(data interface{}) {
	bytes, err := json.Marshal(data)
	if err != nil {
		s.logger.Printf("Failed to marshal JSON: %v", err)
		return
	}

	if _, err := fmt.Fprintf(s.writer, "%s\n", string(bytes)); err != nil {
		s.logger.Printf("Failed to write response: %v", err)
	}

	if err := s.writer.Flush(); err != nil {
		s.logger.Printf("Failed to flush output: %v", err)
	}
}

// sendError sends a JSON-RPC error response
func (s *Server) sendError(id interface{}, code int, message string) {
	response := map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      id,
		"error": map[string]interface{}{
			"code":    code,
			"message": message,
		},
	}

	s.sendJSON(response)
}
