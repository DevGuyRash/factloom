# bash completion for factloom's resumes launcher. Load it with:  source <(path/to/resumes completion bash)
# It asks the tool itself (`resumes __complete`), so commands, flags, people, variants, and themes are
# always the current repository's and nothing needs regenerating after an update. docs/completion.md.
_resumes_complete() {
  local cmd=${COMP_WORDS[0]} cur=${COMP_WORDS[COMP_CWORD]} prev=
  (( COMP_CWORD > 0 )) && prev=${COMP_WORDS[COMP_CWORD-1]}
  case $cmd in "~"*) cmd=$HOME${cmd#"~"} ;; esac
  COMPREPLY=()
  # bash splits --flag=value at "=": completing the value of that form is not supported.
  [[ $cur == "=" || $prev == "=" ]] && return 0
  local out line fallback=none
  out=$("$cmd" __complete "--cur=$cur" -- "${COMP_WORDS[@]:1:COMP_CWORD-1}" 2>/dev/null) || return 0
  while IFS= read -r line; do
    case $line in
      :files | :dirs | :none) fallback=${line#:} ;;
      "") ;;
      *) COMPREPLY+=("${line%%$'\t'*}") ;;
    esac
  done <<<"$out"
  local IFS=$'\n'
  case $fallback in
    files) COMPREPLY+=($(compgen -f -- "$cur")) ;;
    dirs) COMPREPLY+=($(compgen -d -- "$cur")) ;;
  esac
  if [[ $fallback != none ]] && type compopt >/dev/null 2>&1; then compopt -o filenames 2>/dev/null; fi
  return 0
}
# bash looks a command given with a path (./resumes, ~/job-search/resumes) up by its last part as well.
complete -F _resumes_complete resumes ./resumes
