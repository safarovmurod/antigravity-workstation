import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

function git(projectPath, args, quiet = false) {
  const result = spawnSync('git', args, {
    cwd: projectPath,
    encoding: 'utf8',
    stdio: quiet ? 'pipe' : 'inherit',
  })

  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`Git failed: git ${args.join(' ')}`)
  }

  return result.stdout?.trim() || ''
}

function refExists(projectPath, ref) {
  const result = spawnSync('git', ['show-ref', '--verify', '--quiet', ref], {
    cwd: projectPath,
  })
  if (result.error) throw result.error
  if (result.status === 0) return true
  if (result.status === 1) return false
  throw new Error(`Cannot check branch: ${ref}`)
}

function savePractice(projectPath, branch) {
  if (branch === 'main' || branch === 'master') {
    throw new Error('Save is not allowed directly on main. Keep main as the blank starter.')
  }

  const changes = git(projectPath, ['status', '--porcelain'], true)
  if (changes) {
    git(projectPath, ['add', '--all'])
    git(projectPath, ['commit', '-m', `Save ${branch}`])
  }

  git(projectPath, ['push', '-u', 'origin', branch])
}

export function runPractice(projectPath, action, name) {
  try {
    if (!['new', 'save', 'open'].includes(action)) {
      throw new Error('Use npm run practice:new -- <name>, practice:save, or practice:open -- <name>.')
    }

    const currentBranch = git(projectPath, ['branch', '--show-current'], true)
    if (!currentBranch) throw new Error('Switch to a named branch first.')
    git(projectPath, ['remote', 'get-url', 'origin'], true)

    if (action === 'save') {
      savePractice(projectPath, currentBranch)
      console.log(`Saved locally and pushed: ${currentBranch}`)
      return
    }

    if (!name) {
      throw new Error('Enter a practice name, for example: day1, day-2, redux-practice.')
    }

    const branch = name.trim()

    // Validate branch name using Git check-ref-format
    try {
      git(projectPath, ['check-ref-format', '--branch', branch], true)
    } catch {
      throw new Error(`"${branch}" is not a valid Git branch name.`)
    }

    if (action === 'new' && (branch === 'main' || branch === 'master')) {
      throw new Error('Cannot create practice with name "main". Keep main as the blank starter.')
    }

    // Safety guard: NEVER transfer uncommitted changes across branches
    const changes = git(projectPath, ['status', '--porcelain'], true)
    if (changes) {
      throw new Error(`Working tree has uncommitted changes on branch "${currentBranch}". Switching is blocked to prevent leaking changes. Please commit (npm run practice:save), stash, or discard your changes first.`)
    }

    // Fetch latest remote state safely
    git(projectPath, ['fetch', 'origin'], true)

    const localExists = refExists(projectPath, `refs/heads/${branch}`)
    const remoteExists = refExists(projectPath, `refs/remotes/origin/${branch}`)

    if (action === 'new') {
      if (localExists || remoteExists) {
        throw new Error(`Branch "${branch}" already exists. Use npm run practice:open -- ${branch} to open it.`)
      }

      const baseRef = refExists(projectPath, 'refs/remotes/origin/main')
        ? 'origin/main'
        : refExists(projectPath, 'refs/heads/main')
          ? 'main'
          : null

      if (!baseRef) {
        throw new Error('Base starter branch "main" is missing.')
      }

      // Always create clean new practice branch strictly from main
      git(projectPath, ['switch', '--no-track', '-c', branch, baseRef])
      console.log(`Practice branch created: ${branch} (clean from ${baseRef})`)
    } else if (action === 'open') {
      if (branch === currentBranch) {
        console.log(`Already on branch "${branch}"`)
        return
      }

      if (!localExists && !remoteExists) {
        throw new Error(`Branch "${branch}" does not exist. Use npm run practice:new -- ${branch} to create it.`)
      }

      if (localExists) {
        git(projectPath, ['switch', branch])
      } else {
        git(projectPath, ['switch', '--track', '-c', branch, `origin/${branch}`])
      }

      const tracking = git(projectPath, ['for-each-ref', '--format=%(upstream:short)', `refs/heads/${branch}`], true)
      if (tracking) {
        if (tracking !== `origin/${branch}`) {
          throw new Error(`Unexpected upstream "${tracking}" for "${branch}". Check branch tracking before pulling.`)
        }
        git(projectPath, ['pull', '--ff-only'], true)
      }

      const activeBranch = git(projectPath, ['branch', '--show-current'], true)
      const lastCommit = git(projectPath, ['log', '-1', '--oneline'], true)
      console.log(`Opened branch: ${activeBranch}`)
      console.log(`Commit: ${lastCommit}`)
    }
  } catch (error) {
    console.error(`Stopped: ${error.message}`)
    console.error('Check git status. Existing code and commits were not reset or deleted.')
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPractice(process.cwd(), process.argv[2], process.argv[3])
}
