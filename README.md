# Task Master

### by [@eyaltoledano](https://x.com/eyaltoledano)

A task management system for AI-driven development with Ollama, designed to work seamlessly with Cursor AI.

## Requirements

- Node.js 14.0.0 or higher
- Ollama installed and running (https://ollama.com)
- LLM model installed in Ollama (llama3 by default)

## Configuration

The script can be configured through environment variables in a `.env` file at the root of the project:

### Required Configuration

None! The application uses Ollama by default, which doesn't require API keys when running locally.

### Optional Configuration

- `ANTHROPIC_API_KEY`: Your Anthropic API key (not required when using Ollama)
- `MODEL`: Specify which LLM model to use (default: "llama3")
- `MAX_TOKENS`: Maximum tokens for model responses (default: 16000)
- `TEMPERATURE`: Temperature for model responses (default: 0.7)
- `DEBUG`: Enable debug logging (default: false)
- `LOG_LEVEL`: Log level - debug, info, warn, error (default: info)
- `DEFAULT_SUBTASKS`: Default number of subtasks when expanding (default: 3)
- `DEFAULT_PRIORITY`: Default priority for generated tasks (default: medium)
- `PROJECT_NAME`: Override default project name in tasks.json
- `PROJECT_VERSION`: Override default version in tasks.json
- `OLLAMA_API_URL`: URL for Ollama API (default: http://localhost:11434)
- `OLLAMA_MODEL`: Ollama model to use (default: llama3)

## Prerequisites

- Node.js 18+ 
- npm or yarn
- Ollama installed and running (for AI integration)

## Installation

1. Clone this repository:
   ```
   git clone https://github.com/yourusername/task-master.git
   cd task-master
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Configure environment variables:
   - Copy the `.env.example` file to `.env`
   - Set the following environment variables if you want to customize:
     - `OLLAMA_API_URL`: Ollama API URL (default: http://localhost:11434)
     - `OLLAMA_MODEL`: Ollama model to use (default: llama3)

4. Install Ollama and pull the required model:
   - Install Ollama from [https://ollama.com/](https://ollama.com/)
   - Pull the llama3 model:
     ```
     ollama pull llama3
     ```
   - Ensure Ollama is running: `ollama serve`

### Initialize a new project

```bash
# If installed globally
task-master init

# If installed locally
npx task-master-init
```

This will prompt you for project details and set up a new project with the necessary files and structure.

### Important Notes

1. This package uses ES modules. Your package.json should include `"type": "module"`.
2. Make sure Ollama is running before using the task-master commands.

## Quick Start with Global Commands

After installing the package globally, you can use these CLI commands from any directory:

```bash
# Initialize a new project
task-master init

# Parse a PRD and generate tasks
task-master parse-prd your-prd.txt

# List all tasks
task-master list

# Show the next task to work on
task-master next

# Generate task files
task-master generate
```

## Troubleshooting

### If Ollama isn't responding:

- Make sure the Ollama service is running with `ollama serve`
- Verify you have pulled the required model with `ollama list`
- Check your OLLAMA_API_URL setting (default is http://localhost:11434)
- Try using a different model by setting OLLAMA_MODEL in your .env file

### If `task-master init` doesn't respond:

Try running it with Node directly:

```bash
node node_modules/claude-task-master/scripts/init.js
```

Or clone the repository and run:

```bash
git clone https://github.com/eyaltoledano/claude-task-master.git
cd claude-task-master
node scripts/init.js
```

## Task Structure

Tasks in tasks.json have the following structure:

- `id`: Unique identifier for the task (Example: `1`)
- `title`: Brief, descriptive title of the task (Example: `"Initialize Repo"`)
- `description`: Concise description of what the task involves (Example: `"Create a new repository, set up initial structure."`)
- `status`: Current state of the task (Example: `"pending"`, `"done"`, `"deferred"`)
- `dependencies`: IDs of tasks that must be completed before this task (Example: `[1, 2]`)
  - Dependencies are displayed with status indicators (✅ for completed, ⏱️ for pending)
  - This helps quickly identify which prerequisite tasks are blocking work
- `priority`: Importance level of the task (Example: `"high"`, `"medium"`, `"low"`)
- `details`: In-depth implementation instructions (Example: `"Use GitHub client ID/secret, handle callback, set session token."`)
- `testStrategy`: Verification approach (Example: `"Deploy and call endpoint to confirm 'Hello World' response."`)
- `subtasks`: List of smaller, more specific tasks that make up the main task (Example: `[{"id": 1, "title": "Configure OAuth", ...}]`)

## Integrating with Cursor AI

Task Master is designed to work seamlessly with [Cursor AI](https://www.cursor.so/), providing a structured workflow for AI-driven development.

### Setup with Cursor

1. After initializing your project, open it in Cursor
2. The `.cursor/rules/dev_workflow.mdc` file is automatically loaded by Cursor, providing the AI with knowledge about the task management system
3. Place your PRD document in the `scripts/` directory (e.g., `scripts/prd.txt`)
4. Open Cursor's AI chat and switch to Agent mode

### Setting up MCP in Cursor

To enable enhanced task management capabilities directly within Cursor using the Model Control Protocol (MCP):

1. Go to Cursor settings
2. Navigate to the MCP section
3. Click on "Add New MCP Server"
4. Configure with the following details:
   - Name: "Task Master"
   - Type: "Command"
   - Command: "npx -y --package task-master-ai task-master-mcp"
5. Save the settings

Once configured, you can interact with Task Master's task management commands directly through Cursor's interface, providing a more integrated experience.

### Initial Task Generation

In Cursor's AI chat, instruct the agent to generate tasks from your PRD:

```
Please use the task-master parse-prd command to generate tasks from my PRD. The PRD is located at scripts/prd.txt.
```

The agent will execute:

```bash
task-master parse-prd scripts/prd.txt
```

This will:

- Parse your PRD document
- Generate a structured `tasks.json` file with tasks, dependencies, priorities, and test strategies
- The agent will understand this process due to the Cursor rules

### Generate Individual Task Files

Next, ask the agent to generate individual task files:

```
Please generate individual task files from tasks.json
```

The agent will execute:

```bash
task-master generate
```

This creates individual task files in the `tasks/` directory (e.g., `task_001.txt`, `task_002.txt`), making it easier to reference specific tasks.

## AI-Driven Development Workflow

The Cursor agent is pre-configured (via the rules file) to follow this workflow:

### 1. Task Discovery and Selection

Ask the agent to list available tasks:

```
What tasks are available to work on next?
```

The agent will:

- Run `task-master list` to see all tasks
- Run `task-master next` to determine the next task to work on
- Analyze dependencies to determine which tasks are ready to be worked on
- Prioritize tasks based on priority level and ID order
- Suggest the next task(s) to implement

### 2. Task Implementation

When implementing a task, the agent will:

- Reference the task's details section for implementation specifics
- Consider dependencies on previous tasks
- Follow the project's coding standards
- Create appropriate tests based on the task's testStrategy

You can ask:

```
Let's implement task 3. What does it involve?
```

### 3. Task Verification

Before marking a task as complete, verify it according to:

- The task's specified testStrategy
- Any automated tests in the codebase
- Manual verification if required

### 4. Task Completion

When a task is completed, tell the agent:

```
Task 3 is now complete. Please update its status.
```

The agent will execute:

```bash
task-master set-status --id=3 --status=done
```

### 5. Handling Implementation Drift

If during implementation, you discover that:

- The current approach differs significantly from what was planned
- Future tasks need to be modified due to current implementation choices
- New dependencies or requirements have emerged

Tell the agent:

```
We've changed our approach. We're now using Express instead of Fastify. Please update all future tasks to reflect this change.
```

The agent will execute:

```bash
task-master update --from=4 --prompt="Now we are using Express instead of Fastify."
```

This will rewrite or re-scope subsequent tasks in tasks.json while preserving completed work.

### 6. Breaking Down Complex Tasks

For complex tasks that need more granularity:

```
Task 5 seems complex. Can you break it down into subtasks?
```

The agent will execute:

```bash
task-master expand --id=5 --num=3
```

You can provide additional context:

```
Please break down task 5 with a focus on security considerations.
```

The agent will execute:

```bash
task-master expand --id=5 --prompt="Focus on security aspects"
```

You can also expand all pending tasks:

```
Please break down all pending tasks into subtasks.
```

The agent will execute:

```bash
task-master expand --all
```

## Command Reference

Here's a comprehensive reference of all available commands:

### Parse PRD

```bash
# Parse a PRD file and generate tasks
task-master parse-prd <prd-file.txt>

# Limit the number of tasks generated
task-master parse-prd <prd-file.txt> --num-tasks=10
```

### List Tasks

```bash
# List all tasks
task-master list

# List tasks with a specific status
task-master list --status=<status>

# List tasks with subtasks
task-master list --with-subtasks

# List tasks with a specific status and include subtasks
task-master list --status=<status> --with-subtasks
```

### Show Next Task

```bash
# Show the next task to work on based on dependencies and status
task-master next
```

### Show Specific Task

```bash
# Show details of a specific task
task-master show <id>
# or
task-master show --id=<id>

# View a specific subtask (e.g., subtask 2 of task 1)
task-master show 1.2
```

### Update Tasks

```bash
# Update tasks from a specific ID and provide context
task-master update --from=<id> --prompt="<prompt>"
```

### Generate Task Files

```bash
# Generate individual task files from tasks.json
task-master generate
```

### Set Task Status

```bash
# Set status of a single task
task-master set-status --id=<id> --status=<status>

# Set status for multiple tasks
task-master set-status --id=1,2,3 --status=<status>

# Set status for subtasks
task-master set-status --id=1.1,1.2 --status=<status>
```

When marking a task as "done", all of its subtasks will automatically be marked as "done" as well.

### Expand Tasks

```bash
# Expand a specific task with subtasks
task-master expand --id=<id> --num=<number>

# Expand with additional context
task-master expand --id=<id> --prompt="<context>"

# Expand all pending tasks
task-master expand --all

# Force regeneration of subtasks for tasks that already have them
task-master expand --all --force
```

### Clear Subtasks

```bash
# Clear subtasks from a specific task
task-master clear-subtasks --id=<id>

# Clear subtasks from multiple tasks
task-master clear-subtasks --id=1,2,3

# Clear subtasks from all tasks
task-master clear-subtasks --all
```

### Analyze Task Complexity

```bash
# Analyze complexity of all tasks
task-master analyze-complexity

# Save report to a custom location
task-master analyze-complexity --output=my-report.json

# Use a specific LLM model
task-master analyze-complexity --model=llama3

# Set a custom complexity threshold (1-10)
task-master analyze-complexity --threshold=6

# Use an alternative tasks file
task-master analyze-complexity --file=custom-tasks.json
```

### View Complexity Report

```bash
# Display the task complexity analysis report
task-master complexity-report

# View a report at a custom location
task-master complexity-report --file=my-report.json
```

### Managing Task Dependencies

```bash
# Add a dependency to a task
task-master add-dependency --id=<id> --depends-on=<id>

# Remove a dependency from a task
task-master remove-dependency --id=<id> --depends-on=<id>

# Validate dependencies without fixing them
task-master validate-dependencies

# Find and fix invalid dependencies automatically
task-master fix-dependencies
```

### Add a New Task

```bash
# Add a new task with a description
task-master add-task --prompt="Create user authentication using Auth0"

# Add a new task with dependencies and priority
task-master add-task --prompt="Configure database" --dependencies=1,2 --priority=high
```