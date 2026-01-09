use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct MemoryBlockTemplate {
  pub label: String,
  pub scope: String,
  pub value: String,
  pub description: Option<String>,
  pub char_limit: i64,
  pub read_only: bool,
  pub format: String,
  pub egress_policy: String,
}

struct TemplateFile {
  name: &'static str,
  content: &'static str,
}

const DEFAULT_TEMPLATES: &[TemplateFile] = &[
  TemplateFile {
    name: "persona.md",
    content: "---\nlabel: persona\nscope: global\nchar_limit: 2000\nread_only: false\nformat: md\negress_policy: redact_then_send\ndescription: How Atom behaves and communicates\n---\nI am Atom, a local-first coding assistant. I prioritize clarity, correctness, and safety.\n",
  },
  TemplateFile {
    name: "preferences.md",
    content: "---\nlabel: preferences\nscope: global\nchar_limit: 1500\nread_only: false\nformat: yaml\negress_policy: redact_then_send\ndescription: User workflow preferences\n---\nshell: zsh\neditor: null\ntest_framework: null\nstyle:\n  tone: concise\n",
  },
  TemplateFile {
    name: "skills_manifest.md",
    content: "---\nlabel: skills_manifest\nscope: global\nchar_limit: 2000\nread_only: true\nformat: md\negress_policy: redact_then_send\ndescription: Installed skills registry (tool-managed)\n---\n# Skills\n- (none)\n",
  },
  TemplateFile {
    name: "working_set.md",
    content: "---\nlabel: working_set\nscope: project\nchar_limit: 2000\nread_only: false\nformat: yaml\negress_policy: redact_then_send\ndescription: Current task state\n---\nobjective: null\nplan: []\ncurrent_step: null\nblocked_on: []\nopen_questions: []\ndefinition_of_done: null\nlast_action: null\n",
  },
  TemplateFile {
    name: "codebase_context.md",
    content: "---\nlabel: codebase_context\nscope: project\nchar_limit: 4000\nread_only: false\nformat: yaml\negress_policy: redact_then_send\ndescription: Learned codebase patterns\n---\nclaims: []\n",
  },
  TemplateFile {
    name: "session_resume.md",
    content: "---\nlabel: session_resume\nscope: session\nchar_limit: 2000\nread_only: false\nformat: yaml\negress_policy: redact_then_send\ndescription: Session checkpoint summary\n---\nobjective: null\nstatus: null\nlast_tool_results: []\nnext_steps: []\nblockers: []\n",
  },
];

fn parse_frontmatter(content: &str) -> (HashMap<String, String>, String) {
  let mut lines = content.lines();
  let first = lines.next().unwrap_or("");
  if first.trim() != "---" {
    return (HashMap::new(), content.trim().to_string());
  }
  let mut frontmatter = Vec::new();
  let mut body = Vec::new();
  let mut in_frontmatter = true;
  for line in lines {
    if in_frontmatter && line.trim() == "---" {
      in_frontmatter = false;
      continue;
    }
    if in_frontmatter {
      frontmatter.push(line);
    } else {
      body.push(line);
    }
  }

  let mut map = HashMap::new();
  for line in frontmatter {
    let trimmed = line.trim();
    if trimmed.is_empty() || trimmed.starts_with('#') {
      continue;
    }
    if let Some((key, value)) = trimmed.split_once(':') {
      map.insert(key.trim().to_string(), value.trim().to_string());
    }
  }
  (map, body.join("\n").trim().to_string())
}

fn template_from_content(content: &str) -> Option<MemoryBlockTemplate> {
  let (frontmatter, body) = parse_frontmatter(content);
  let label = frontmatter.get("label")?.to_string();
  let scope = frontmatter.get("scope")?.to_string();
  let char_limit = frontmatter
    .get("char_limit")
    .and_then(|v| v.parse::<i64>().ok())
    .unwrap_or(4000);
  let read_only = frontmatter
    .get("read_only")
    .map(|v| v == "true" || v == "1")
    .unwrap_or(false);
  let format = frontmatter
    .get("format")
    .cloned()
    .unwrap_or_else(|| "md".to_string());
  let egress_policy = frontmatter
    .get("egress_policy")
    .cloned()
    .unwrap_or_else(|| "redact_then_send".to_string());
  let description = frontmatter.get("description").cloned();

  Some(MemoryBlockTemplate {
    label,
    scope,
    value: body,
    description,
    char_limit,
    read_only,
    format,
    egress_policy,
  })
}

pub fn ensure_default_templates(dir: &Path) -> Result<(), String> {
  fs::create_dir_all(dir).map_err(|e| e.to_string())?;
  for template in DEFAULT_TEMPLATES {
    let path = dir.join(template.name);
    if path.exists() {
      continue;
    }
    fs::write(&path, template.content).map_err(|e| e.to_string())?;
  }
  Ok(())
}

pub fn load_templates(dir: &Path) -> Result<Vec<MemoryBlockTemplate>, String> {
  let mut out = Vec::new();
  if !dir.exists() {
    return Ok(out);
  }
  let entries = fs::read_dir(dir).map_err(|e| e.to_string())?;
  for entry in entries {
    let entry = entry.map_err(|e| e.to_string())?;
    let path = entry.path();
    if !path.is_file() {
      continue;
    }
    let ext = path.extension().and_then(|v| v.to_str()).unwrap_or("");
    if ext != "md" && ext != "txt" {
      continue;
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    if let Some(template) = template_from_content(&content) {
      out.push(template);
    }
  }
  Ok(out)
}

pub fn templates_root(base_dir: &Path) -> PathBuf {
  base_dir.join("memory_blocks")
}
