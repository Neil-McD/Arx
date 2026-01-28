#[derive(Debug, Clone)]
pub struct RedactionReport {
  pub blocked: bool,
  pub redactions: Vec<(String, usize)>,
}

pub fn redact_secrets(input: &str) -> (String, RedactionReport) {
  let mut output = input.to_string();
  let mut redactions = Vec::new();

  let patterns = [
    ("openai_key", r"sk-[A-Za-z0-9]{20,}"),
    ("anthropic_key", r"sk-ant-[A-Za-z0-9-_]{10,}"),
    ("google_key", r"AIza[0-9A-Za-z\\-_]{35}"),
    ("aws_access_key", r"AKIA[0-9A-Z]{16}"),
    (
      "aws_secret",
      r"(?i)aws_secret_access_key\\s*=\\s*[A-Za-z0-9/+=]{20,}",
    ),
    (
      "generic_api_key",
      r"(?i)api[_-]?key\\s*[:=]\\s*[A-Za-z0-9-_]{16,}",
    ),
    ("bearer", r"(?i)bearer\\s+[A-Za-z0-9\\-_.=]{16,}"),
    ("password", r"(?i)password\\s*[:=]\\s*[^\\s]{6,}"),
    (
      "private_key",
      r"-----BEGIN[ A-Z]*PRIVATE KEY-----[\\s\\S]+?-----END[ A-Z]*PRIVATE KEY-----",
    ),
  ];

  for (name, pattern) in patterns {
    if let Ok(re) = regex::Regex::new(pattern) {
      let count = re.find_iter(&output).count();
      if count > 0 {
        output = re.replace_all(&output, "[REDACTED]").to_string();
        redactions.push((name.to_string(), count));
      }
    }
  }

  let blocked = redactions
    .iter()
    .any(|(kind, _)| kind == "private_key" || kind == "aws_secret");
  (
    output,
    RedactionReport {
      blocked,
      redactions,
    },
  )
}

