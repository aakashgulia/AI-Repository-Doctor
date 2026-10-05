import { useEffect, useMemo, useState } from "react"

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Brain,
  CircleDot,
  Database,
  FileCode2,
  FolderGit2,
  GitBranch,
  LayoutDashboard,
  Loader2,
  MessageSquareCode,
  Microscope,
  Network,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Stethoscope,
  TestTube2,
  Terminal,
  Upload,
  X,
  Zap,
} from "lucide-react"

const API_BASE = "http://127.0.0.1:8000"

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "I Have a Problem", icon: Stethoscope },
  { label: "Doctor Chat", icon: MessageSquareCode },
  { label: "What Changed?", icon: GitBranch },
  { label: "Ask My Codebase", icon: MessageSquareCode },
  { label: "Test My Change", icon: TestTube2 },
  { label: "Doctor Reports", icon: FileCode2 },
]

type DiagnosisResult = {
  status: string
  problem: string
  diagnosis: string
  confidence: number
  affected_files: string[]
  recommendations: string[]
  evidence: string[]
  risk: string
}

type ChatMessage = {
  id: number
  role: "user" | "doctor"
  content: string
  confidence?: number
  evidence?: string[]
  repositoryName?: string
  loading?: boolean
}

type Repository = {
  id: string
  name: string
  local_path: string
  source_type: string
  github_url: string | null
  file_count: number
  indexed_chunks: number
  indexing_status: string
  git_available?: boolean
}

type RepositoryMetrics = {
  repository_id: string
  repository_name: string
  tests: {
    passed: number
    failed: number
    total: number
    pass_rate: number
    exit_code: number
  }
  repository: {
    files: number
    indexed_chunks: number
    indexing_status: string
    git_available: boolean
  }
}

type LiveEvent = {
  id: number
  label: string
  detail: string
  icon: "scan" | "index" | "test" | "issue" | "rag"
  age: string
}

type ChangeFile = {
  path: string
  old_path: string | null
  new_path: string | null
  change_type: string
  additions: number
  deletions: number
}

type ChangedSymbol = {
  file_path: string
  name: string
  symbol_type: string
  change_type: string
  old_start_line: number | null
  old_end_line: number | null
  new_start_line: number | null
  new_end_line: number | null
  deleted_lines: number[]
  added_lines: number[]
}

type ImpactTarget = {
  file_path: string
  function_name: string
  module: string
}

type FunctionCallImpact = {
  file_path: string
  function_name: string
  called_name: string
  line_number: number
}

type ModuleImportImpact = {
  file_path: string
  imported_module: string
  line_number: number
}

type RelatedTest = {
  file_path: string
  test_name: string
  calls: string
  line_number: number
}

type ChangeImpact = {
  target: ImpactTarget
  function_calls: FunctionCallImpact[]
  module_imports: ModuleImportImpact[]
  related_tests: RelatedTest[]
}

type ChangeInterpretation = {
  summary: string
  why_it_matters: string
  regression_risk: string
  affected_areas: string[]
  recommended_tests: string[]
  confidence: number
}

type ChangeResult = {
  status: string
  repository: {
    id: string
    name: string
    local_path: string
    source_type: string
    git_available: boolean
  }
  comparison: {
    from_commit: string
    to_commit: string
    changed_files: ChangeFile[]
    diff: string
    changed_symbols: ChangedSymbol[]
    impacts: ChangeImpact[]
  }
  interpretation: ChangeInterpretation
}

type TestChangeResult = {
  status: string
  repository: {
    id: string
    name: string
    local_path: string
    source_type: string
    git_available: boolean
  }
  comparison: {
    from_commit: string
    to_commit: string
    changed_files: ChangeFile[]
    changed_symbols: ChangedSymbol[]
  }
  test_selection: {
    strategy: string
    related_tests: RelatedTest[]
    selected_tests: string[]
    count: number
  }
  test_results: {
    passed: number
    failed: number
    skipped: number
    errors: number
    total: number
    pass_rate: number
    exit_code: number
    output: string
    selected_tests: string[]
  }
}

function App() {
  const [activePage, setActivePage] = useState("Dashboard")
  const [problem, setProblem] = useState("")
  const [diagnosed, setDiagnosed] = useState(false)
  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const [chatInput, setChatInput] = useState("")
  const [chatLoading, setChatLoading] = useState(false)
  const [chatError, setChatError] = useState("")
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])

  const [repositories, setRepositories] = useState<Repository[]>([])
  const [activeRepository, setActiveRepository] = useState<Repository | null>(null)
  const [repositoryMetrics, setRepositoryMetrics] =useState<RepositoryMetrics | null>(null)
  const [repositoriesLoading, setRepositoriesLoading] = useState(true)
  const [repositoryError, setRepositoryError] = useState("")
  const [showRepositoryManager, setShowRepositoryManager] = useState(false)
  const [showAddRepository, setShowAddRepository] = useState(false)
  const [repositoryPath, setRepositoryPath] = useState("")
  const [addingRepository, setAddingRepository] = useState(false)
  const [uploadingRepository, setUploadingRepository] = useState(false)
  const [repositoryActionId, setRepositoryActionId] = useState<string | null>(null)

  const [changeFromCommit, setChangeFromCommit] = useState("")
  const [changeToCommit, setChangeToCommit] = useState("")
  const [changeLoading, setChangeLoading] = useState(false)
  const [changeError, setChangeError] = useState("")
  const [changeResult, setChangeResult] = useState<ChangeResult | null>(null)

  const [testFromCommit, setTestFromCommit] = useState("")
  const [testToCommit, setTestToCommit] = useState("")
  const [testChangeLoading, setTestChangeLoading] = useState(false)
  const [testChangeError, setTestChangeError] = useState("")
  const [testChangeResult, setTestChangeResult] =
    useState<TestChangeResult | null>(null)

  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([
    {
      id: 1,
      label: "Doctor ready",
      detail: "Waiting for a repository action",
      icon: "scan",
      age: "ready",
    },
  ])

  const [terminalLines, setTerminalLines] = useState<string[]>([
    "Doctor engine ready",
    "Repository actions will appear here",
    "Waiting for a diagnosis, chat question, or change analysis...",
  ])

  useEffect(() => {
    loadRepositories()
  }, [])
  useEffect(() => {
  if (!activeRepository?.id) {
    setRepositoryMetrics(null)
    return
  }

  loadRepositoryMetrics(activeRepository.id)
}, [activeRepository?.id])

  useEffect(() => {
    const poll = window.setInterval(() => {
      loadRepositories(true)
    }, 10000)

    return () => window.clearInterval(poll)
  }, [])

  const loadRepositories = async (silent = false) => {
    if (!silent) {
      setRepositoriesLoading(true)
      setRepositoryError("")
    }

    try {
      const response = await fetch(`${API_BASE}/api/repositories`)

      if (!response.ok) {
        throw new Error(
          `Repository API failed with status ${response.status}`,
        )
      }

      const data = await response.json()

      const loadedRepositories: Repository[] =
        data.repositories ?? (Array.isArray(data) ? data : [])

      setRepositories(loadedRepositories)

      const activeResponse = await fetch(
        `${API_BASE}/api/repositories/active`,
      )

      if (activeResponse.ok) {
        const activeData = await activeResponse.json()

        setActiveRepository(
          activeData.repository ??
            activeData.active_repository ??
            null,
        )
      }
    } catch (err) {
      console.error(err)

      if (!silent) {
        setRepositoryError(
          "Could not load repositories. Make sure the FastAPI backend is running on port 8000.",
        )
      }
    } finally {
      if (!silent) {
        setRepositoriesLoading(false)
      }
    }
  }
      const loadRepositoryMetrics = async (
      repositoryId: string,
    ) => {
      try {
        const response = await fetch(
          `${API_BASE}/api/repositories/${repositoryId}/metrics`,
        )

        if (!response.ok) {
          throw new Error(
            `Metrics API failed with status ${response.status}`,
          )
        }

        const data: RepositoryMetrics =
          await response.json()

        setRepositoryMetrics(data)
      } catch (err) {
        console.error("Failed to load repository metrics:", err)
        setRepositoryMetrics(null)
      }
    }

  const handleSelectRepository = async (repositoryId: string) => {
    setRepositoryActionId(repositoryId)
    setRepositoryError("")

    try {
      const response = await fetch(
        `${API_BASE}/api/repositories/active`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            repository_id: repositoryId,
          }),
        },
      )

      if (!response.ok) {
        throw new Error(
          `Failed to select repository: ${response.status}`,
        )
      }

      const data = await response.json()

      setActiveRepository(data.repository ?? null)
      setDiagnosed(false)
      setDiagnosis(null)
      setError("")
      setChangeResult(null)
      setChangeError("")
      setTestChangeResult(null)
      setTestChangeError("")
    } catch (err) {
      console.error(err)
      setRepositoryError("Could not select this repository.")
    } finally {
      setRepositoryActionId(null)
    }
  }

  const handleIndexRepository = async (repositoryId: string) => {
    setRepositoryActionId(repositoryId)
    setRepositoryError("")

    setRepositories((current) =>
      current.map((repository) =>
        repository.id === repositoryId
          ? { ...repository, indexing_status: "INDEXING" }
          : repository,
      ),
    )

    if (activeRepository?.id === repositoryId) {
      setActiveRepository((current) =>
        current
          ? { ...current, indexing_status: "INDEXING" }
          : current,
      )
    }

    try {
      const response = await fetch(
        `${API_BASE}/api/repositories/${repositoryId}/index`,
        {
          method: "POST",
        },
      )

      if (!response.ok) {
        throw new Error(
          `Indexing failed with status ${response.status}`,
        )
      }

      const data = await response.json()

      setRepositories((current) =>
        current.map((repository) =>
          repository.id === repositoryId
            ? {
                ...repository,
                file_count:
                  data.file_count ?? repository.file_count,
                indexed_chunks:
                  data.indexed_chunks ?? repository.indexed_chunks,
                indexing_status: "INDEXED",
              }
            : repository,
        ),
      )

      if (activeRepository?.id === repositoryId) {
        setActiveRepository((current) =>
          current
            ? {
                ...current,
                file_count:
                  data.file_count ?? current.file_count,
                indexed_chunks:
                  data.indexed_chunks ?? current.indexed_chunks,
                indexing_status: "INDEXED",
              }
            : current,
        )
      }

      addLiveEvent(
        "Repository re-indexed",
        "Fresh code chunks are available",
        "index",
      )
    } catch (err) {
      console.error(err)
      setRepositoryError("Repository indexing failed.")
    } finally {
      setRepositoryActionId(null)
    }
  }

  const handleAddRepository = async () => {
    if (!repositoryPath.trim()) {
      return
    }

    setAddingRepository(true)
    setRepositoryError("")

    try {
      const response = await fetch(
        `${API_BASE}/api/repositories`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            repository_path: repositoryPath.trim(),
          }),
        },
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.detail ??
            `Failed to add repository: ${response.status}`,
        )
      }

      const addedRepository: Repository =
        data.repository ?? data

      setRepositories((current) =>
        current.some(
          (repository) =>
            repository.id === addedRepository.id,
        )
          ? current.map((repository) =>
              repository.id === addedRepository.id
                ? addedRepository
                : repository,
            )
          : [...current, addedRepository],
      )

      setRepositoryPath("")
      setShowAddRepository(false)

      await handleSelectRepository(addedRepository.id)

      addLiveEvent(
        "Repository added",
        `${addedRepository.name} connected to Doctor`,
        "scan",
      )
    } catch (err) {
      console.error(err)

      setRepositoryError(
        err instanceof Error
          ? err.message
          : "Could not add this repository.",
      )
    } finally {
      setAddingRepository(false)
    }
  }

  const handleUploadRepository = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setRepositoryError(
        "Please select a ZIP repository file.",
      )
      return
    }

    setUploadingRepository(true)
    setRepositoryError("")

    try {
      const formData = new FormData()
      formData.append("file", file)

      const response = await fetch(
        `${API_BASE}/api/repositories/upload`,
        {
          method: "POST",
          body: formData,
        },
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.detail ??
            `Failed to upload repository: ${response.status}`,
        )
      }

      const uploadedRepository: Repository =
        data.repository ?? data

      setRepositories((current) =>
        current.some(
          (repository) =>
            repository.id === uploadedRepository.id,
        )
          ? current.map((repository) =>
              repository.id === uploadedRepository.id
                ? uploadedRepository
                : repository,
            )
          : [...current, uploadedRepository],
      )

      setShowAddRepository(false)
      setRepositoryPath("")

      await handleSelectRepository(uploadedRepository.id)

      addLiveEvent(
        "ZIP repository connected",
        `${uploadedRepository.name} indexed`,
        "index",
      )
    } catch (err) {
      console.error(err)

      setRepositoryError(
        err instanceof Error
          ? err.message
          : "Could not upload this repository.",
      )
    } finally {
      setUploadingRepository(false)
    }
  }

  const handleDiagnose = async () => {
    if (!problem.trim()) {
      return
    }

    setLoading(true)
    setError("")
    setDiagnosed(false)
    setDiagnosis(null)

    addLiveEvent(
      "Doctor diagnosis started",
      "Investigating the reported problem",
      "issue",
    )

    setTerminalLines((current) =>
      [
        ...current,
        `[${new Date().toLocaleTimeString([], {
          hour12: false,
        })}]  Diagnosis requested`,
        `[${new Date().toLocaleTimeString([], {
          hour12: false,
        })}]  Retrieving repository evidence...`,
      ].slice(-7),
    )

    try {
      const response = await fetch(
        `${API_BASE}/api/diagnose`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            problem,
            repository_id:
              activeRepository?.id ?? undefined,
          }),
        },
      )

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => null)

        throw new Error(
          errorData?.detail ??
            `API request failed with status ${response.status}`,
        )
      }

      const rawData = await response.json()

      const data: DiagnosisResult = {
        status: rawData.status ?? "success",
        problem: rawData.problem ?? problem,
        diagnosis:
          rawData.diagnosis ??
          "No diagnosis was returned.",
        confidence: rawData.confidence ?? 0,
        affected_files:
          rawData.affected_files ?? [],
        recommendations:
          rawData.recommendations ?? [],
        evidence: rawData.evidence ?? [],
        risk: rawData.risk ?? "MEDIUM",
      }

      setDiagnosis(data)
      setDiagnosed(true)

      addLiveEvent(
        "Diagnosis completed",
        `${data.confidence}% confidence`,
        "issue",
      )

      setTerminalLines((current) =>
        [
          ...current,
          `[${new Date().toLocaleTimeString([], {
            hour12: false,
          })}]  Diagnosis completed`,
          `[${new Date().toLocaleTimeString([], {
            hour12: false,
          })}]  Confidence: ${data.confidence}%`,
        ].slice(-7),
      )
    } catch (err) {
      console.error(err)

      setError(
        err instanceof Error
          ? err.message
          : "Doctor could not connect to the FastAPI backend.",
      )
    } finally {
      setLoading(false)
    }
  }

  const handleChat = async () => {
    const question = chatInput.trim()

    if (!question || chatLoading) {
      return
    }

    if (!activeRepository) {
      setChatError(
        "Select an active repository before chatting with Doctor.",
      )
      return
    }

    const userMessage: ChatMessage = {
      id: Date.now(),
      role: "user",
      content: question,
    }

    setChatMessages((current) => [
      ...current,
      userMessage,
      {
        id: Date.now() + 1,
        role: "doctor",
        content:
          "Doctor is searching your repository and analyzing the relevant evidence...",
        loading: true,
      },
    ])

    setChatInput("")
    setChatLoading(true)
    setChatError("")

    addLiveEvent(
      "Doctor Chat started",
      `Investigating ${activeRepository.name}`,
      "rag",
    )

    setTerminalLines((current) =>
      [
        ...current,
        `[${new Date().toLocaleTimeString([], {
          hour12: false,
        })}]  Chat question received`,
        `[${new Date().toLocaleTimeString([], {
          hour12: false,
        })}]  Retrieving repository evidence...`,
      ].slice(-7),
    )

    try {
      const response = await fetch(
        `${API_BASE}/api/chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            question,
            repository_id: activeRepository.id,
          }),
        },
      )

      const rawData = await response
        .json()
        .catch(() => ({}))

      if (!response.ok) {
        throw new Error(
          rawData.detail ??
            `Chat API failed with status ${response.status}`,
        )
      }

      const evidence = Array.isArray(
        rawData.evidence,
      )
        ? rawData.evidence.map((item: unknown) => {
            if (typeof item === "string") {
              return item
            }

            if (
              item &&
              typeof item === "object"
            ) {
              const value =
                item as Record<
                  string,
                  unknown
                >

              return String(
                value.file_path ??
                  value.file ??
                  value.content ??
                  JSON.stringify(item),
              )
            }

            return String(item)
          })
        : []

      const doctorMessage: ChatMessage = {
        id: Date.now() + 2,
        role: "doctor",
        content:
          rawData.answer ??
          "Doctor did not return an answer.",
        confidence:
          typeof rawData.confidence === "number"
            ? rawData.confidence
            : undefined,
        evidence,
        repositoryName:
          rawData.repository_name ??
          activeRepository.name,
      }

      setChatMessages((current) =>
        [
          ...current.filter(
            (message) => !message.loading,
          ),
          doctorMessage,
        ],
      )

      addLiveEvent(
        "Doctor Chat completed",
        `${doctorMessage.confidence ?? 0}% confidence`,
        "rag",
      )

      setTerminalLines((current) =>
        [
          ...current,
          `[${new Date().toLocaleTimeString([], {
            hour12: false,
          })}]  Chat response generated`,
          `[${new Date().toLocaleTimeString([], {
            hour12: false,
          })}]  Evidence items: ${evidence.length}`,
        ].slice(-7),
      )
    } catch (err) {
      console.error(err)

      setChatMessages((current) =>
        current.filter(
          (message) => !message.loading,
        ),
      )

      setChatError(
        err instanceof Error
          ? err.message
          : "Doctor could not connect to the chat service.",
      )
    } finally {
      setChatLoading(false)
    }
  }

  const handleAnalyzeChanges = async () => {
    if (changeLoading) {
      return
    }

    const fromCommit = changeFromCommit.trim()
    const toCommit = changeToCommit.trim()

    if (!activeRepository) {
      setChangeError(
        "Select an active repository before analyzing changes.",
      )
      return
    }

    if (!activeRepository.git_available) {
      setChangeError(
        "What Changed? requires a Git repository with commit history.",
      )
      return
    }

    if (!fromCommit || !toCommit) {
      setChangeError(
        "Enter both the older commit and the newer commit.",
      )
      return
    }

    if (fromCommit === toCommit) {
      setChangeError(
        "From and To commits must be different.",
      )
      return
    }

    setChangeLoading(true)
    setChangeError("")
    setChangeResult(null)

    addLiveEvent(
      "Change analysis started",
      `${fromCommit.slice(0, 7)} → ${toCommit.slice(0, 7)}`,
      "issue",
    )

    setTerminalLines((current) =>
      [
        ...current,
        `[${new Date().toLocaleTimeString([], {
          hour12: false,
        })}]  What Changed? analysis requested`,
        `[${new Date().toLocaleTimeString([], {
          hour12: false,
        })}]  Comparing ${fromCommit.slice(
          0,
          7,
        )} → ${toCommit.slice(0, 7)}`,
        `[${new Date().toLocaleTimeString([], {
          hour12: false,
        })}]  Running impact analysis...`,
      ].slice(-7),
    )

    try {
      const response = await fetch(
        `${API_BASE}/api/changes`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            repository_id:
              activeRepository.id,
            from_commit: fromCommit,
            to_commit: toCommit,
          }),
        },
      )

      const rawData = await response
        .json()
        .catch(() => ({}))

      if (!response.ok) {
        throw new Error(
          rawData.detail ??
            `Change API failed with status ${response.status}`,
        )
      }

      const data: ChangeResult =
        rawData

      setChangeResult(data)

      addLiveEvent(
        "Change analysis completed",
        `${data.comparison.changed_files.length} files changed · ${data.interpretation.confidence}% confidence`,
        "issue",
      )

      setTerminalLines((current) =>
        [
          ...current,
          `[${new Date().toLocaleTimeString([], {
            hour12: false,
          })}]  Change analysis completed`,
          `[${new Date().toLocaleTimeString([], {
            hour12: false,
          })}]  Files changed: ${data.comparison.changed_files.length}`,
          `[${new Date().toLocaleTimeString([], {
            hour12: false,
          })}]  Symbols changed: ${data.comparison.changed_symbols.length}`,
          `[${new Date().toLocaleTimeString([], {
            hour12: false,
          })}]  Regression risk: ${data.interpretation.regression_risk}`,
        ].slice(-7),
      )
    } catch (err) {
      console.error(err)

      setChangeError(
        err instanceof Error
          ? err.message
          : "Doctor could not analyze the selected commits.",
      )

      setTerminalLines((current) =>
        [
          ...current,
          `[${new Date().toLocaleTimeString([], {
            hour12: false,
          })}]  What Changed? analysis failed`,
        ].slice(-7),
      )
    } finally {
      setChangeLoading(false)
    }
  }

  const handleTestMyChange = async () => {
    if (testChangeLoading) {
      return
    }

    const fromCommit = testFromCommit.trim()
    const toCommit = testToCommit.trim()

    if (!activeRepository) {
      setTestChangeError(
        "Select an active repository before testing a change.",
      )
      return
    }

    if (!activeRepository.git_available) {
      setTestChangeError(
        "Test My Change requires a Git repository with commit history.",
      )
      return
    }

    if (!fromCommit || !toCommit) {
      setTestChangeError(
        "Enter both the older commit and the newer commit.",
      )
      return
    }

    if (fromCommit === toCommit) {
      setTestChangeError(
        "From and To commits must be different.",
      )
      return
    }

    setTestChangeLoading(true)
    setTestChangeError("")
    setTestChangeResult(null)

    addLiveEvent(
      "Targeted regression test started",
      `${fromCommit.slice(0, 7)} → ${toCommit.slice(0, 7)}`,
      "test",
    )

    setTerminalLines((current) =>
      [
        ...current,
        `[${new Date().toLocaleTimeString([], {
          hour12: false,
        })}]  Test My Change requested`,
        `[${new Date().toLocaleTimeString([], {
          hour12: false,
        })}]  Comparing ${fromCommit.slice(
          0,
          7,
        )} → ${toCommit.slice(0, 7)}`,
        `[${new Date().toLocaleTimeString([], {
          hour12: false,
        })}]  Selecting tests from impact analysis...`,
      ].slice(-7),
    )

    try {
      const response = await fetch(
        `${API_BASE}/api/test-change`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            repository_id: activeRepository.id,
            from_commit: fromCommit,
            to_commit: toCommit,
          }),
        },
      )

      const rawData = await response
        .json()
        .catch(() => ({}))

      if (!response.ok) {
        throw new Error(
          rawData.detail ??
            `Test My Change API failed with status ${response.status}`,
        )
      }

      const data: TestChangeResult = rawData
      setTestChangeResult(data)

      addLiveEvent(
        "Targeted regression test completed",
        `${data.test_results.passed}/${data.test_results.total} selected tests passed`,
        "test",
      )

      setTerminalLines((current) =>
        [
          ...current,
          `[${new Date().toLocaleTimeString([], {
            hour12: false,
          })}]  Impact analysis selected ${data.test_selection.count} test(s)`,
          `[${new Date().toLocaleTimeString([], {
            hour12: false,
          })}]  Passed: ${data.test_results.passed}`,
          `[${new Date().toLocaleTimeString([], {
            hour12: false,
          })}]  Failed: ${data.test_results.failed}`,
          `[${new Date().toLocaleTimeString([], {
            hour12: false,
          })}]  Targeted test pass rate: ${data.test_results.pass_rate}%`,
        ].slice(-7),
      )
    } catch (err) {
      console.error(err)

      setTestChangeError(
        err instanceof Error
          ? err.message
          : "Doctor could not execute the targeted regression tests.",
      )

      setTerminalLines((current) =>
        [
          ...current,
          `[${new Date().toLocaleTimeString([], {
            hour12: false,
          })}]  Test My Change failed`,
        ].slice(-7),
      )
    } finally {
      setTestChangeLoading(false)
    }
  }

  const loadDemoTestChange = () => {
    setTestFromCommit("98efbb9")
    setTestToCommit("34cac1f")
    setTestChangeError("")
    setTestChangeResult(null)
  }

  const loadDemoComparison = () => {
    setChangeFromCommit("98efbb9")
    setChangeToCommit("34cac1f")
    setChangeError("")
    setChangeResult(null)
  }

  const addLiveEvent = (
    label: string,
    detail: string,
    icon: LiveEvent["icon"],
  ) => {
    setLiveEvents((current) =>
      [
        {
          id: Date.now(),
          label,
          detail,
          icon,
          age: "just now",
        },
        ...current,
      ].slice(0, 7),
    )
  }

  const dashboardStats = useMemo(() => {
    const files =
      activeRepository?.file_count ?? 12

    const chunks =
      activeRepository?.indexed_chunks ?? 4

    const indexed =
      activeRepository?.indexing_status?.toUpperCase() ===
      "INDEXED"

    return {
      health: indexed ? 92 : 76,
      confidence: indexed ? 87 : 64,
      files,
      chunks,
    }
  }, [activeRepository])

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f5f8ff] text-[#14213d]">
      <style>{`
        @keyframes floatOrb {
          0%,100% { transform: translate3d(0,0,0); }
          50% { transform: translate3d(18px,-12px,0); }
        }

        @keyframes scanLine {
          0% { transform: translateX(-120%); }
          100% { transform: translateX(420%); }
        }

        @keyframes pulseRing {
          0% { transform: scale(.75); opacity:.7; }
          100% { transform: scale(1.8); opacity:0; }
        }


        .scan-line {
          animation: scanLine 2.8s linear infinite;
        }

        .float-orb {
          animation: floatOrb 7s ease-in-out infinite;
        }

        .pulse-ring {
          animation: pulseRing 2s ease-out infinite;
        }

      `}</style>

      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="float-orb absolute -left-32 -top-36 h-[520px] w-[520px] rounded-full bg-blue-300/25 blur-[110px]" />
        <div className="float-orb absolute right-[-180px] top-[25%] h-[540px] w-[540px] rounded-full bg-violet-300/20 blur-[120px]" />
        <div className="absolute bottom-[-200px] left-[35%] h-[420px] w-[420px] rounded-full bg-cyan-200/20 blur-[110px]" />
      </div>

      <div className="relative flex min-h-screen">
        <aside className="hidden w-[248px] shrink-0 border-r border-slate-200/80 bg-white/85 px-4 py-5 backdrop-blur-xl lg:block">
          <div className="mb-8 flex items-center gap-3 px-2">
            <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-lg shadow-blue-500/25">
              <Stethoscope size={22} />
              <span className="pulse-ring absolute inset-0 rounded-2xl border-2 border-blue-400/60" />
            </div>

            <div>
              <h1 className="text-[15px] font-bold tracking-tight">
                Repository Doctor
              </h1>
              <p className="text-[10px] text-slate-500">
                AI code intelligence
              </p>
            </div>
          </div>

          <div className="mb-3 px-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
            Workspace
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive =
                activePage === item.label

              return (
                <button
                  key={item.label}
                  onClick={() => {
                    setActivePage(item.label)
                    setDiagnosed(false)
                  }}
                  className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[12px] font-medium transition-all ${
                    isActive
                      ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/20"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <Icon
                    size={17}
                    className={
                      isActive
                        ? "text-white"
                        : "text-slate-500"
                    }
                  />

                  <span>{item.label}</span>

                  {isActive && (
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-white shadow-[0_0_8px_white]" />
                  )}
                </button>
              )
            })}
          </nav>

          <div className="mt-8 px-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
            Tools
          </div>

          <button
            onClick={() =>
              setShowRepositoryManager(true)
            }
            className="mt-3 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-[12px] font-medium text-slate-600 transition hover:bg-slate-100"
          >
            <FolderGit2
              size={17}
              className="text-slate-500"
            />
            Repository Manager
          </button>

          <button
            onClick={() =>
              setActivePage("Settings")
            }
            className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-[12px] font-medium text-slate-600 transition hover:bg-slate-100"
          >
            <Settings
              size={17}
              className="text-slate-500"
            />
            Settings
          </button>

          <div className="absolute bottom-5 left-4 right-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm">
                  <Activity size={14} />
                </span>

                <div>
                  <p className="text-[11px] font-bold text-slate-800">
                    Doctor Ready
                  </p>

                  <p className="text-[9px] text-slate-500">
                    Waiting for your request
                  </p>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-[1580px] px-5 py-5 sm:px-7 lg:px-9">
            <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="mb-1 flex items-center gap-2 text-[11px] font-medium text-blue-600">
                  <CircleDot size={12} />
                  Developer Workspace
                </div>

                <h2 className="text-3xl font-extrabold tracking-[-0.04em] sm:text-4xl">
                  {activePage === "Dashboard" ? (
                    <>
                      Welcome back,{" "}
                      <span className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">
                        Developer!
                      </span>
                    </>
                  ) : (
                    activePage
                  )}
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  {activePage === "Dashboard"
                    ? "Your codebase is being continuously analyzed by Doctor."
                    : getPageDescription(
                        activePage,
                      )}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="hidden rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 shadow-sm md:flex md:items-center md:gap-2">
                  <Search size={14} />
                  Search files, issues, or ask a question...
                </div>

                <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-bold text-emerald-700">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  System operational
                </div>
              </div>
            </header>

            <section className="mb-5 overflow-hidden rounded-2xl border border-blue-100 bg-white/90 p-4 shadow-[0_12px_40px_rgba(37,99,235,.07)] backdrop-blur-xl">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex min-w-[260px] flex-1 items-center gap-3">
                  <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <GitBranch size={19} />
                    <span className="pulse-ring absolute inset-0 rounded-xl border border-blue-300" />
                  </div>

                  <div className="min-w-0">
                    <p className="text-[10px] font-medium text-slate-400">
                      Active repository
                    </p>

                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-bold text-slate-800">
                        {activeRepository?.name ??
                          "No repository selected"}
                      </p>

                      {activeRepository && (
                        <IndexingBadge
                          status={
                            activeRepository.indexing_status
                          }
                        />
                      )}
                    </div>

                    <p className="truncate text-[9px] text-slate-400">
                      {activeRepository?.local_path ??
                        "Connect a repository to begin"}
                    </p>
                  </div>
                </div>

                <StatMini
                  icon={FileCode2}
                  value={String(
                    dashboardStats.files,
                  )}
                  label="Files"
                />

                <StatMini
                  icon={Database}
                  value={String(
                    dashboardStats.chunks,
                  )}
                  label="Indexed chunks"
                />

                <StatMini
                  icon={GitBranch}
                  value={
                    activeRepository?.git_available
                      ? "Git"
                      : "ZIP/Folder"
                  }
                  label="Source"
                />

                <button
                  onClick={() =>
                    setShowRepositoryManager(true)
                  }
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-3 text-[11px] font-bold text-white shadow-lg shadow-blue-500/20 transition hover:-translate-y-0.5"
                >
                  <FolderGit2 size={15} />
                  Manage repositories
                  <ArrowRight size={14} />
                </button>
              </div>
            </section>

            {activePage === "Dashboard" && (
              <Dashboard
                activeRepository={activeRepository}
                stats={dashboardStats}
                repositoryMetrics={repositoryMetrics}
                liveEvents={liveEvents}
                terminalLines={terminalLines}
                onProblem={() =>
                  setActivePage(
                    "I Have a Problem",
                  )
                }
              />
            )}

            {activePage === "I Have a Problem" && (
              <ProblemDiagnosis
                problem={problem}
                setProblem={setProblem}
                setDiagnosed={setDiagnosed}
                diagnosed={diagnosed}
                diagnosis={diagnosis}
                loading={loading}
                error={error}
                onDiagnose={handleDiagnose}
              />
            )}

            {activePage === "Doctor Chat" && (
              <DoctorChat
                activeRepository={activeRepository}
                messages={chatMessages}
                input={chatInput}
                setInput={setChatInput}
                loading={chatLoading}
                error={chatError}
                onSend={handleChat}
              />
            )}

            {activePage === "What Changed?" && (
              <WhatChanged
                activeRepository={
                  activeRepository
                }
                fromCommit={changeFromCommit}
                toCommit={changeToCommit}
                setFromCommit={
                  setChangeFromCommit
                }
                setToCommit={setChangeToCommit}
                loading={changeLoading}
                error={changeError}
                result={changeResult}
                onAnalyze={
                  handleAnalyzeChanges
                }
                onDemo={loadDemoComparison}
              />
            )}

            {activePage === "Ask My Codebase" && (
              <AskMyCodebase
                activeRepository={activeRepository}
              />
            )}

            {activePage === "Test My Change" && (
              <TestMyChange
                activeRepository={activeRepository}
                fromCommit={testFromCommit}
                toCommit={testToCommit}
                setFromCommit={setTestFromCommit}
                setToCommit={setTestToCommit}
                loading={testChangeLoading}
                error={testChangeError}
                result={testChangeResult}
                onTest={handleTestMyChange}
                onDemo={loadDemoTestChange}
              />
            )}

            {activePage === "Doctor Reports" && (
              <DoctorReports
                activeRepository={activeRepository}
                repositoryMetrics={repositoryMetrics}
                diagnosis={diagnosis}
                changeResult={changeResult}
                testChangeResult={testChangeResult}
                chatMessages={chatMessages}
              />
            )}

            {activePage !== "Dashboard" &&
              activePage !==
                "I Have a Problem" &&
              activePage !== "Doctor Chat" &&
              activePage !==
                "What Changed?" &&
              activePage !==
                "Ask My Codebase" &&
              activePage !==
                "Test My Change" &&
              activePage !==
                "Doctor Reports" && (
                <PlaceholderPage
                  title={activePage}
                />
              )}
          </div>
        </main>
      </div>

      {showRepositoryManager && (
        <RepositoryManagerModal
          repositories={repositories}
          activeRepository={activeRepository}
          loading={repositoriesLoading}
          error={repositoryError}
          actionId={repositoryActionId}
          onClose={() => {
            setShowRepositoryManager(false)
            setRepositoryError("")
          }}
          onRefresh={loadRepositories}
          onSelect={handleSelectRepository}
          onIndex={handleIndexRepository}
          onAdd={() => {
            setShowAddRepository(true)
            setRepositoryError("")
          }}
        />
      )}

      {showAddRepository && (
        <AddRepositoryModal
          path={repositoryPath}
          setPath={setRepositoryPath}
          loading={
            addingRepository ||
            uploadingRepository
          }
          error={repositoryError}
          onClose={() => {
            setShowAddRepository(false)
            setRepositoryError("")
          }}
          onAdd={handleAddRepository}
          onUpload={handleUploadRepository}
        />
      )}
    </div>
  )
}

function Dashboard({
  activeRepository,
  stats,
  repositoryMetrics,
  liveEvents,
  terminalLines,
  onProblem,
}: {
  activeRepository: Repository | null
  stats: {
    health: number
    confidence: number
    files: number
    chunks: number
  }
  repositoryMetrics: RepositoryMetrics | null
  liveEvents: LiveEvent[]
  terminalLines: string[]
  onProblem: () => void
}) {
  const repositoryStatus =
    activeRepository?.indexing_status?.toUpperCase() ?? "NOT_INDEXED"
  const isIndexed = repositoryStatus === "INDEXED"
  const isIndexing = repositoryStatus === "INDEXING"
  const hasRepository = Boolean(activeRepository)

  const stages = [
    {
      label: "Scanner",
      icon: FolderGit2,
      status: isIndexing ? "Indexing" : isIndexed ? "Ready" : "Waiting",
      state: isIndexing ? "active" : isIndexed ? "ready" : "waiting",
    },
    {
      label: "Analyzer",
      icon: Brain,
      status: isIndexed ? "Ready" : "Waiting",
      state: isIndexed ? "ready" : "waiting",
    },
    {
      label: "RAG",
      icon: Database,
      status: isIndexed ? "Ready" : "Waiting",
      state: isIndexed ? "ready" : "waiting",
    },
    {
      label: "Dependency",
      icon: Network,
      status: isIndexed ? "Available" : "Waiting",
      state: isIndexed ? "ready" : "waiting",
    },
    {
      label: "Test Engine",
      icon: TestTube2,
      status: isIndexed ? "Ready" : "Waiting",
      state: isIndexed ? "ready" : "waiting",
    },
    {
      label: "Diagnosis",
      icon: Stethoscope,
      status: "Waiting for request",
      state: "waiting",
    },
  ]

  const indexedFileCount = activeRepository?.file_count ?? 0
  const progressLabel = isIndexing
    ? "Indexing repository..."
    : isIndexed
      ? "Repository index is ready"
      : hasRepository
        ? "Repository not indexed"
        : "No repository selected"

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AnimatedMetric
  label="Tests Passing"
  value={repositoryMetrics?.tests.passed ?? 0}
  suffix={` / ${repositoryMetrics?.tests.total ?? 0}`}
  description={
    repositoryMetrics
      ? `${repositoryMetrics.tests.failed} failing test${
          repositoryMetrics.tests.failed === 1 ? "" : "s"
        }`
      : "Loading test results"
  }
  icon={TestTube2}
  tone="violet"
/>

        <AnimatedMetric
          label="Doctor Confidence"
          value={stats.confidence}
          suffix="%"
          description="High confidence"
          icon={Brain}
          tone="blue"
        />

        <AnimatedMetric
          label="Tests Passing"
          value={7}
          suffix="/ 8"
          description="1 failing test"
          icon={TestTube2}
          tone="violet"
        />

        <AnimatedMetric
          label="Risky Files"
          value={3}
          suffix=""
          description="Needs attention"
          icon={AlertTriangle}
          tone="orange"
        />
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[1.65fr_1fr_1fr]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_40px_rgba(37,99,235,.06)]">
          <div className="border-b border-slate-100 p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Zap size={19} />
                  <span className="pulse-ring absolute inset-0 rounded-xl border border-blue-300" />
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold">
                      Doctor Engine
                    </h3>

                    <span className={`flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-bold ${
                      isIndexing
                        ? "bg-blue-50 text-blue-600"
                        : "bg-slate-100 text-slate-600"
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${
                        isIndexing
                          ? "animate-pulse bg-blue-500"
                          : "bg-slate-400"
                      }`} />
                      {isIndexing ? "WORKING" : "STANDBY"}
                    </span>
                  </div>

                  <p className="mt-0.5 text-[10px] text-slate-400">
                    {isIndexing
                      ? "Repository indexing is currently in progress."
                      : "Doctor runs when you request an analysis, test, or code investigation."}
                  </p>
                </div>
              </div>

              <span className="hidden rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-semibold text-slate-500 sm:block">
                {progressLabel}
              </span>
            </div>

            <div className="mt-7 flex items-start justify-between gap-1 overflow-hidden">
              {stages.map((stage, index) => {
                const Icon = stage.icon
                const active = stage.state === "active"
                const ready = stage.state === "ready"

                return (
                  <div
                    key={stage.label}
                    className="relative flex min-w-[72px] flex-1 flex-col items-center"
                  >
                    {index > 0 && (
                      <div className="absolute left-[-50%] right-[50%] top-6 h-0.5 overflow-hidden bg-slate-100">
                        <div
                          className={`h-full ${
                            ready ? "w-full bg-blue-200" : "w-0"
                          }`}
                        />
                      </div>
                    )}

                    <div
                      className={`relative z-10 flex h-12 w-12 items-center justify-center rounded-full border-4 border-white shadow-sm ${
                        active
                          ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30"
                          : ready
                            ? "bg-blue-50 text-blue-600"
                            : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      <Icon size={19} />

                      {active && (
                        <span className="pulse-ring absolute inset-0 rounded-full border-2 border-blue-400" />
                      )}
                    </div>

                    <p
                      className={`mt-2 text-[9px] font-bold ${
                        active
                          ? "text-blue-700"
                          : ready
                            ? "text-slate-600"
                            : "text-slate-500"
                      }`}
                    >
                      {stage.label}
                    </p>

                    <p className="mt-0.5 text-center text-[8px] text-slate-400">
                      {stage.status}
                    </p>
                  </div>
                )
              })}
            </div>

            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between gap-3 text-[10px] font-medium text-slate-500">
                <span>{progressLabel}</span>

                <span>
                  {isIndexed
                    ? `${indexedFileCount} / ${indexedFileCount} files indexed`
                    : isIndexing
                      ? "Working..."
                      : "No indexing activity"}
                </span>
              </div>

              <div className="relative h-2 overflow-hidden rounded-full bg-slate-100">
                {isIndexing ? (
                  <div className="scan-line absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-blue-500 to-transparent" />
                ) : (
                  <div
                    className={`h-full rounded-full ${
                      isIndexed
                        ? "w-full bg-gradient-to-r from-blue-600 via-cyan-500 to-violet-600"
                        : "w-0"
                    }`}
                  />
                )}
              </div>

              <div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                <FileCode2
                  size={14}
                  className="text-blue-600"
                />

                <span className="truncate font-mono text-[10px] text-slate-600">
                  {activeRepository
                    ? activeRepository.local_path
                    : "No repository connected"}
                </span>

                {isIndexing && (
                  <span className="ml-auto flex shrink-0 items-center gap-1 text-[9px] font-semibold text-blue-600">
                    <Loader2
                      size={11}
                      className="animate-spin"
                    />
                    Indexing
                  </span>
                )}

                {isIndexed && (
                  <span className="ml-auto flex shrink-0 items-center gap-1 text-[9px] font-semibold text-emerald-600">
                    <ShieldCheck size={11} />
                    Ready
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <LiveRepositoryGraph
          activeRepository={activeRepository}
          stats={stats}
        />

        <LiveActivity events={liveEvents} />
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        <LatestAnalysis
          onProblem={onProblem}
        />

        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#10172a] text-slate-200 shadow-[0_18px_45px_rgba(15,23,42,.15)]">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <Terminal
                size={15}
                className="text-cyan-400"
              />

              <span className="text-[11px] font-bold">
                Doctor Terminal
              </span>

              <span className={`h-1.5 w-1.5 rounded-full ${
                isIndexing
                  ? "animate-pulse bg-blue-400"
                  : "bg-slate-500"
              }`} />
            </div>

            <span className="text-[9px] text-slate-500">
              {isIndexing ? "working" : "standby"}
            </span>
          </div>

          <div className="h-[285px] overflow-hidden p-4 font-mono text-[9px] leading-6">
            {terminalLines.map(
              (line, index) => (
                <div
                  key={`${line}-${index}`}
                  className={
                    line.includes(
                      "warning",
                    ) ||
                    line.includes(
                      "regression",
                    )
                      ? "text-amber-300"
                      : "text-slate-400"
                  }
                >
                  <span className="mr-2 text-blue-400">
                    ›
                  </span>
                  {line}
                </div>
              ),
            )}

            <div className="mt-2 border-t border-white/5 pt-2 text-slate-500">
              <span className="mr-2 text-blue-400">›</span>
              {isIndexing
                ? "Indexing repository..."
                : "No active Doctor operation"}
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

function AnimatedMetric({
  label,
  value,
  suffix,
  description,
  icon: Icon,
  tone,
}: {
  label: string
  value: number
  suffix: string
  description: string
  icon: typeof ShieldCheck
  tone:
    | "green"
    | "blue"
    | "violet"
    | "orange"
}) {

  const config = {
    green: {
      box: "bg-gradient-to-br from-emerald-50 to-white border-emerald-100",
      icon: "bg-emerald-100 text-emerald-600",
      number: "text-emerald-600",
      spark: "text-emerald-500",
    },
    blue: {
      box: "bg-gradient-to-br from-blue-50 to-white border-blue-100",
      icon: "bg-blue-100 text-blue-600",
      number: "text-blue-600",
      spark: "text-blue-500",
    },
    violet: {
      box: "bg-gradient-to-br from-violet-50 to-white border-violet-100",
      icon: "bg-violet-100 text-violet-600",
      number: "text-violet-600",
      spark: "text-violet-500",
    },
    orange: {
      box: "bg-gradient-to-br from-orange-50 to-white border-orange-100",
      icon: "bg-orange-100 text-orange-600",
      number: "text-orange-600",
      spark: "text-orange-500",
    },
  }[tone]

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-lg ${config.box}`}
    >
      <div className="absolute right-0 top-0 h-20 w-20 rounded-full bg-white/50 blur-2xl" />

      <div className="flex items-center justify-between">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-xl ${config.icon}`}
        >
          <Icon size={17} />
        </div>

        <MiniSparkline
          className={config.spark}
        />
      </div>

      <p className="mt-3 text-[10px] font-semibold text-slate-500">
        {label}
      </p>

      <div className="mt-1 flex items-baseline gap-1">
        <span
          className={`text-3xl font-extrabold tracking-tight ${config.number}`}
        >
          {value}
        </span>

        <span className="text-xs font-bold text-slate-400">
          {suffix}
        </span>
      </div>

      <p className="mt-1 text-[9px] font-medium text-slate-400">
        {description}
      </p>
    </div>
  )
}

function MiniSparkline({
  className,
}: {
  className: string
}) {
  const points = [
    [2, 28],
    [15, 26],
    [27, 30],
    [40, 20],
    [53, 24],
    [66, 13],
    [79, 18],
    [94, 8],
  ]

  return (
    <svg
      width="82"
      height="34"
      viewBox="0 0 96 34"
      className={className}
    >
      <polyline
        points={points
          .map(
            ([x, y]) =>
              `${x},${y}`,
          )
          .join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="transition-all duration-700"
      />
    </svg>
  )
}

function LiveRepositoryGraph({
  activeRepository,
  stats,
}: {
  activeRepository: Repository | null
  stats: {
    files: number
    chunks: number
  }
}) {
  const isIndexed =
    activeRepository?.indexing_status?.toUpperCase() === "INDEXED"

  const nodes = [
    {
      label: `${stats.files} files`,
      x: "50%",
      y: "10%",
      tone: "violet",
    },
    {
      label: `${stats.chunks} chunks`,
      x: "82%",
      y: "42%",
      tone: "blue",
    },
    {
      label: activeRepository?.git_available ? "Git history" : "No Git",
      x: "75%",
      y: "82%",
      tone: "violet",
    },
    {
      label: activeRepository?.source_type === "zip" ? "ZIP source" : "Local source",
      x: "50%",
      y: "92%",
      tone: "amber",
    },
    {
      label: isIndexed ? "RAG ready" : "RAG waiting",
      x: "18%",
      y: "72%",
      tone: "blue",
    },
    {
      label: isIndexed ? "Doctor ready" : "Needs indexing",
      x: "15%",
      y: "34%",
      tone: "green",
    },
  ]

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
          <Network size={16} />
        </div>

        <div>
          <h3 className="text-sm font-bold">
            Repository Overview
          </h3>

          <p className="text-[9px] text-slate-400">
            Current repository state
          </p>
        </div>
      </div>

      <div className="relative mt-3 h-[225px] overflow-hidden rounded-xl bg-gradient-to-br from-slate-50 to-blue-50/50">
        <svg className="absolute inset-0 h-full w-full">
          {nodes.map((node) => (
            <line
              key={node.label}
              x1="50%"
              y1="50%"
              x2={node.x}
              y2={node.y}
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-blue-300/60"
            />
          ))}
        </svg>

        <div className="absolute left-1/2 top-1/2 flex max-w-[110px] -translate-x-1/2 -translate-y-1/2 flex-col items-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg">
            <FolderGit2 size={19} />
          </div>
          <p className="mt-1 max-w-[110px] truncate text-center text-[8px] font-bold text-slate-600">
            {activeRepository?.name ?? "No repository"}
          </p>
        </div>

        {nodes.map((node, index) => (
          <div
            key={node.label}
            className="absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-700"
            style={{
              left: node.x,
              top: node.y,
            }}
          >
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-md ring-4 ${
                node.tone === "red"
                  ? "text-red-500 ring-red-100"
                  : node.tone ===
                      "green"
                    ? "text-emerald-500 ring-emerald-100"
                    : node.tone ===
                        "amber"
                      ? "text-amber-500 ring-amber-100"
                      : node.tone ===
                          "violet"
                        ? "text-violet-500 ring-violet-100"
                        : "text-blue-500 ring-blue-100"
              }`}
            >
              <FileCode2 size={13} />
            </div>

            <p className="mt-1 whitespace-nowrap text-center text-[8px] font-semibold text-slate-500">
              {node.label}
            </p>

            {isIndexed && index === 0 && (
              <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500" />
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-[8px] text-slate-500">
        <span>
          <i className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />
          Ready
        </span>

        <span>
          <i className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-500" />
          Repository data
        </span>

        <span>
          <i className="mr-1 inline-block h-2 w-2 rounded-full bg-orange-500" />
          Action needed
        </span>
      </div>
    </div>
  )
}

function LiveActivity({
  events,
}: {
  events: LiveEvent[]
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <Activity size={16} />
          </div>

          <h3 className="text-sm font-bold">
            Doctor Activity
          </h3>
        </div>

        <span className="text-[8px] font-bold text-slate-400">
          RECENT
        </span>
      </div>

      <div className="relative mt-4 space-y-2.5">
        <div className="absolute bottom-1 left-[7px] top-1 w-px bg-slate-100" />

        {events.map((event) => (
          <div
            key={event.id}
            className="relative flex gap-3 animate-[fadeIn_.5s_ease-out]"
          >
            <div className="relative z-10 mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-white bg-blue-500 shadow-sm" />

            <div className="min-w-0 flex-1 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[9px] font-bold text-slate-700">
                  {event.label}
                </p>

                <span className="whitespace-nowrap text-[8px] text-slate-400">
                  {event.age}
                </span>
              </div>

              <p className="mt-0.5 truncate text-[8px] text-slate-400">
                {event.detail}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function LatestAnalysis({
  onProblem,
}: {
  onProblem: () => void
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <FileCode2 size={17} />
          </div>

          <div>
            <p className="text-[9px] font-semibold text-slate-400">
              Latest Doctor Analysis
            </p>

            <h3 className="text-sm font-bold">
              Most recent code analysis and findings
            </h3>
          </div>
        </div>

        <button
          onClick={onProblem}
          className="hidden items-center gap-1 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[9px] font-bold text-blue-600 sm:flex"
        >
          Investigate
          <ArrowRight size={11} />
        </button>
      </div>

      <div className="mt-4 rounded-xl border border-amber-100 bg-gradient-to-r from-amber-50/70 to-white p-4">
        <span className="rounded-full bg-amber-100 px-2 py-1 text-[8px] font-extrabold uppercase tracking-wide text-amber-700">
          Medium risk
        </span>

        <h4 className="mt-2 text-sm font-extrabold text-slate-800">
          Why does completing a task remove its priority?
        </h4>

        <p className="mt-1 text-[10px] leading-5 text-slate-500">
          The complete_task function rebuilds the
          task dictionary and omits the priority
          field, causing the priority to be lost when
          a task is marked as completed.
        </p>

        <div className="mt-3 flex flex-wrap gap-3 text-[8px] font-medium text-slate-400">
          <span className="flex items-center gap-1">
            <FileCode2 size={11} />
            app/tasks.py
          </span>

          <span className="flex items-center gap-1">
            <Brain size={11} />
            2 recommendations
          </span>

          <span className="flex items-center gap-1 text-blue-600">
            <ShieldCheck size={11} />
            95% confidence
          </span>
        </div>
      </div>
    </div>
  )
}

function StatMini({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof FileCode2
  value: string
  label: string
}) {
  return (
    <div className="flex min-w-[105px] items-center gap-2 border-l border-slate-100 pl-4">
      <Icon
        size={18}
        className="text-blue-500"
      />

      <div>
        <p className="text-sm font-bold text-slate-800">
          {value}
        </p>

        <p className="text-[8px] text-slate-400">
          {label}
        </p>
      </div>
    </div>
  )
}

function WhatChanged({
  activeRepository,
  fromCommit,
  toCommit,
  setFromCommit,
  setToCommit,
  loading,
  error,
  result,
  onAnalyze,
  onDemo,
}: {
  activeRepository: Repository | null
  fromCommit: string
  toCommit: string
  setFromCommit: (value: string) => void
  setToCommit: (value: string) => void
  loading: boolean
  error: string
  result: ChangeResult | null
  onAnalyze: () => void
  onDemo: () => void
}) {
  const interpretation =
    result?.interpretation

  const comparison =
    result?.comparison

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex items-start gap-4">
            <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-50 to-violet-50 text-blue-600">
              <GitBranch size={21} />

              <span className="pulse-ring absolute inset-0 rounded-xl border border-blue-300" />
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-extrabold text-slate-800">
                  Understand what changed
                </h3>

                {activeRepository?.git_available && (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[8px] font-bold uppercase tracking-wider text-emerald-600">
                    Git enabled
                  </span>
                )}
              </div>

              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
                Compare two commits and let Doctor
                explain the code changes, affected
                symbols, dependencies, tests, and
                regression risk.
              </p>
            </div>
          </div>

          <button
            onClick={onDemo}
            disabled={loading}
            className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-[10px] font-bold text-blue-600 transition hover:bg-blue-100 disabled:opacity-40"
          >
            Load demo comparison
          </button>
        </div>

        {!activeRepository ? (
          <div className="mt-6 rounded-xl border border-amber-100 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle
                size={17}
                className="mt-0.5 shrink-0 text-amber-600"
              />

              <div>
                <p className="text-xs font-bold text-amber-800">
                  No active repository
                </p>

                <p className="mt-1 text-[10px] leading-5 text-amber-700">
                  Open Repository Manager and
                  select a Git repository before
                  comparing commits.
                </p>
              </div>
            </div>
          </div>
        ) : !activeRepository.git_available ? (
          <div className="mt-6 rounded-xl border border-amber-100 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle
                size={17}
                className="mt-0.5 shrink-0 text-amber-600"
              />

              <div>
                <p className="text-xs font-bold text-amber-800">
                  Git history is unavailable
                </p>

                <p className="mt-1 text-[10px] leading-5 text-amber-700">
                  This repository can still be
                  analyzed as a project folder or ZIP,
                  but What Changed? needs Git commit
                  history.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-6 grid gap-4 md:grid-cols-[1fr_auto_1fr_auto] md:items-end">
              <CommitInput
                label="From commit"
                hint="Older / source state"
                value={fromCommit}
                onChange={setFromCommit}
                placeholder="98efbb9"
                disabled={loading}
              />

              <div className="hidden h-11 items-center justify-center text-blue-500 md:flex">
                <ArrowRight size={20} />
              </div>

              <CommitInput
                label="To commit"
                hint="Newer / target state"
                value={toCommit}
                onChange={setToCommit}
                placeholder="34cac1f"
                disabled={loading}
              />

              <button
                onClick={onAnalyze}
                disabled={
                  loading ||
                  !fromCommit.trim() ||
                  !toCommit.trim()
                }
                className="flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-5 text-[11px] font-bold text-white shadow-lg shadow-blue-500/20 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? (
                  <Loader2
                    size={15}
                    className="animate-spin"
                  />
                ) : (
                  <Microscope size={15} />
                )}

                {loading
                  ? "Analyzing..."
                  : "Analyze Changes"}
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 text-[9px] text-slate-400">
              <span className="flex items-center gap-1">
                <GitBranch
                  size={11}
                  className="text-blue-500"
                />
                Direction:
                <strong className="text-slate-600">
                  From → To
                </strong>
              </span>

              <span className="h-1 w-1 rounded-full bg-slate-300" />

              <span>
                Repository:
                <strong className="ml-1 text-slate-600">
                  {activeRepository.name}
                </strong>
              </span>
            </div>

            {error && (
              <div className="mt-5 rounded-xl border border-red-100 bg-red-50 p-4 text-xs leading-5 text-red-600">
                {error}
              </div>
            )}

            {loading && (
              <div className="mt-5 overflow-hidden rounded-xl border border-blue-100 bg-blue-50/60 p-4">
                <div className="flex items-center gap-3 text-xs font-bold text-blue-700">
                  <Loader2
                    size={15}
                    className="animate-spin"
                  />
                  Doctor is analyzing Git history,
                  changed symbols, impact, and
                  regression risk...
                </div>

                <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-blue-100">
                  <div className="scan-line absolute inset-y-0 left-0 w-1/3 rounded-full bg-blue-500" />
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {result && comparison && interpretation && (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <ChangeMetric
              label="Changed files"
              value={comparison.changed_files.length}
              icon={FileCode2}
              detail={`${countAdditions(comparison.changed_files)} additions`}
            />

            <ChangeMetric
              label="Changed symbols"
              value={comparison.changed_symbols.length}
              icon={Microscope}
              detail="Functions analyzed"
            />

            <ChangeMetric
              label="Impact targets"
              value={comparison.impacts.length}
              icon={Network}
              detail="Dependency relationships"
            />

            <ChangeMetric
              label="Doctor confidence"
              value={interpretation.confidence}
              suffix="%"
              icon={Brain}
              detail="Evidence-backed interpretation"
            />
          </section>

          <section className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-blue-500">
                    Change Summary
                  </p>

                  <h3 className="mt-1 text-lg font-extrabold text-slate-800">
                    {comparison.from_commit.slice(
                      0,
                      7,
                    )}{" "}
                    <span className="text-blue-500">
                      →
                    </span>{" "}
                    {comparison.to_commit.slice(
                      0,
                      7,
                    )}
                  </h3>
                </div>

                <RiskBadge
                  value={
                    interpretation.regression_risk
                  }
                />
              </div>

              <div className="mt-5 rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50/70 to-violet-50/60 p-5">
                <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-blue-600">
                  What Doctor found
                </p>

                <p className="mt-3 text-sm leading-7 text-slate-600">
                  {interpretation.summary}
                </p>
              </div>

              <div className="mt-5">
                <p className="mb-3 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">
                  Why it matters
                </p>

                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-sm leading-6 text-slate-600">
                    {interpretation.why_it_matters}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                  <AlertTriangle size={18} />
                </div>

                <div>
                  <p className="text-xs text-slate-400">
                    Regression Assessment
                  </p>

                  <h3 className="mt-1 font-bold text-slate-800">
                    Risk analysis
                  </h3>
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-amber-100 bg-amber-50/60 p-4">
                <p className="text-sm font-bold leading-6 text-amber-800">
                  {interpretation.regression_risk}
                </p>
              </div>

              <div className="mt-5">
                <p className="mb-3 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">
                  Affected areas
                </p>

                <div className="space-y-2">
                  {interpretation.affected_areas.map(
                    (area, index) => (
                      <div
                        key={`${area}-${index}`}
                        className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5"
                      >
                        <FileCode2
                          size={13}
                          className="mt-0.5 shrink-0 text-blue-500"
                        />

                        <span className="font-mono text-[10px] leading-5 text-slate-500">
                          {area}
                        </span>
                      </div>
                    ),
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-blue-500">
                  Changed Files
                </p>

                <h3 className="mt-1 text-lg font-extrabold text-slate-800">
                  Files modified by this change
                </h3>
              </div>

              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[9px] font-bold text-slate-500">
                {comparison.changed_files.length} files
              </span>
            </div>

            <div className="mt-5 overflow-hidden rounded-xl border border-slate-100">
              <div className="hidden grid-cols-[1fr_90px_90px_90px] border-b border-slate-100 bg-slate-50 px-4 py-3 text-[8px] font-bold uppercase tracking-wider text-slate-400 sm:grid">
                <span>File</span>
                <span>Type</span>
                <span>Additions</span>
                <span>Deletions</span>
              </div>

              {comparison.changed_files.map(
                (file) => (
                  <div
                    key={`${file.path}-${file.change_type}`}
                    className="grid gap-2 border-b border-slate-100 px-4 py-4 last:border-0 sm:grid-cols-[1fr_90px_90px_90px] sm:items-center"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <FileCode2
                        size={15}
                        className="shrink-0 text-blue-500"
                      />

                      <span className="truncate font-mono text-[10px] text-slate-600">
                        {file.path}
                      </span>
                    </div>

                    <span
                      className={`w-fit rounded-full px-2 py-1 text-[8px] font-bold uppercase ${
                        file.change_type === "A"
                          ? "bg-emerald-50 text-emerald-600"
                          : file.change_type ===
                              "D"
                            ? "bg-red-50 text-red-600"
                            : "bg-blue-50 text-blue-600"
                      }`}
                    >
                      {file.change_type ===
                      "M"
                        ? "Modified"
                        : file.change_type ===
                            "A"
                          ? "Added"
                          : file.change_type ===
                              "D"
                            ? "Deleted"
                            : file.change_type}
                    </span>

                    <span className="text-[10px] font-bold text-emerald-600">
                      +{file.additions}
                    </span>

                    <span className="text-[10px] font-bold text-red-500">
                      -{file.deletions}
                    </span>
                  </div>
                ),
              )}
            </div>
          </section>

          <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                  <Microscope size={18} />
                </div>

                <div>
                  <p className="text-xs text-slate-400">
                    Symbol Analysis
                  </p>

                  <h3 className="mt-1 font-bold text-slate-800">
                    What changed inside the code
                  </h3>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {comparison.changed_symbols.map(
                  (symbol, index) => (
                    <div
                      key={`${symbol.file_path}-${symbol.name}-${index}`}
                      className="rounded-xl border border-slate-100 bg-slate-50 p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-blue-50 px-2 py-1 text-[8px] font-bold uppercase text-blue-600">
                          {symbol.change_type}
                        </span>

                        <span className="font-mono text-[10px] font-bold text-slate-700">
                          {symbol.name}
                        </span>

                        <span className="text-[8px] text-slate-400">
                          {symbol.symbol_type}
                        </span>
                      </div>

                      <p className="mt-2 font-mono text-[9px] text-slate-400">
                        {symbol.file_path}
                      </p>

                      <div className="mt-3 flex flex-wrap gap-2 text-[8px] text-slate-400">
                        {symbol.old_start_line !==
                          null && (
                          <span>
                            Old lines{" "}
                            {symbol.old_start_line}–
                            {symbol.old_end_line}
                          </span>
                        )}

                        {symbol.new_start_line !==
                          null && (
                          <span>
                            New lines{" "}
                            {symbol.new_start_line}–
                            {symbol.new_end_line}
                          </span>
                        )}
                      </div>
                    </div>
                  ),
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600">
                  <Network size={18} />
                </div>

                <div>
                  <p className="text-xs text-slate-400">
                    Impact Analysis
                  </p>

                  <h3 className="mt-1 font-bold text-slate-800">
                    Who depends on the change
                  </h3>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {comparison.impacts.map(
                  (impact, index) => (
                    <div
                      key={`${impact.target.file_path}-${impact.target.function_name}-${index}`}
                      className="rounded-xl border border-slate-100 bg-slate-50 p-4"
                    >
                      <div className="flex items-start gap-2">
                        <FileCode2
                          size={14}
                          className="mt-0.5 shrink-0 text-blue-500"
                        />

                        <div className="min-w-0">
                          <p className="font-mono text-[10px] font-bold text-slate-700">
                            {
                              impact.target
                                .function_name
                            }
                          </p>

                          <p className="mt-1 font-mono text-[8px] text-slate-400">
                            {
                              impact.target
                                .file_path
                            }
                          </p>
                        </div>
                      </div>

                      {impact.related_tests
                        .length > 0 && (
                        <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50 p-3">
                          <p className="text-[8px] font-bold uppercase tracking-wider text-emerald-600">
                            Related tests
                          </p>

                          <div className="mt-2 space-y-1">
                            {impact.related_tests.map(
                              (test) => (
                                <p
                                  key={`${test.file_path}-${test.test_name}-${test.line_number}`}
                                  className="font-mono text-[9px] text-emerald-700"
                                >
                                  {test.test_name}
                                </p>
                              ),
                            )}
                          </div>
                        </div>
                      )}

                      {impact.function_calls
                        .length > 0 && (
                        <div className="mt-3">
                          <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400">
                            Callers
                          </p>

                          <div className="mt-2 space-y-1">
                            {impact.function_calls.map(
                              (caller) => (
                                <p
                                  key={`${caller.file_path}-${caller.function_name}-${caller.line_number}`}
                                  className="font-mono text-[9px] text-slate-500"
                                >
                                  {
                                    caller.function_name
                                  }{" "}
                                  ·{" "}
                                  {
                                    caller.file_path
                                  }
                                  :
                                  {
                                    caller.line_number
                                  }
                                </p>
                              ),
                            )}
                          </div>
                        </div>
                      )}

                      {impact.module_imports
                        .length > 0 && (
                        <div className="mt-3">
                          <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400">
                            Module imports
                          </p>

                          <div className="mt-2 space-y-1">
                            {impact.module_imports.map(
                              (item) => (
                                <p
                                  key={`${item.file_path}-${item.line_number}`}
                                  className="font-mono text-[9px] text-slate-500"
                                >
                                  {
                                    item.imported_module
                                  }{" "}
                                  ·{" "}
                                  {item.file_path}
                                </p>
                              ),
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ),
                )}
              </div>
            </div>
          </section>

          <section className="grid gap-5 xl:grid-cols-[1fr_.8fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <TestTube2 size={18} />
                </div>

                <div>
                  <p className="text-xs text-slate-400">
                    Validation
                  </p>

                  <h3 className="mt-1 font-bold text-slate-800">
                    Recommended tests
                  </h3>
                </div>
              </div>

              <ol className="mt-5 space-y-3">
                {interpretation.recommended_tests.map(
                  (test, index) => (
                    <li
                      key={`${test}-${index}`}
                      className="flex gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 font-mono text-[9px] font-bold text-emerald-600">
                        {String(
                          index + 1,
                        ).padStart(2, "0")}
                      </span>

                      <span className="text-xs leading-6 text-slate-500">
                        {test}
                      </span>
                    </li>
                  ),
                )}
              </ol>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <GitBranch size={18} />
                </div>

                <div>
                  <p className="text-xs text-slate-400">
                    Comparison
                  </p>

                  <h3 className="mt-1 font-bold text-slate-800">
                    Commit states
                  </h3>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                <CommitCard
                  label="FROM"
                  commit={
                    comparison.from_commit
                  }
                  description="Older source state"
                />

                <div className="flex justify-center text-blue-500">
                  <ArrowRight size={18} />
                </div>

                <CommitCard
                  label="TO"
                  commit={
                    comparison.to_commit
                  }
                  description="Newer target state"
                />
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-800 bg-[#10172a] shadow-[0_18px_45px_rgba(15,23,42,.15)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div className="flex items-center gap-3">
                <Terminal
                  size={16}
                  className="text-cyan-400"
                />

                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-cyan-400">
                    Repository Evidence
                  </p>

                  <h3 className="mt-1 text-sm font-bold text-white">
                    Full Git diff
                  </h3>
                </div>
              </div>

              <span className="rounded-full bg-white/5 px-3 py-1.5 font-mono text-[8px] text-slate-400">
                {comparison.from_commit.slice(
                  0,
                  7,
                )}{" "}
                →{" "}
                {comparison.to_commit.slice(
                  0,
                  7,
                )}
              </span>
            </div>

            <pre className="max-h-[560px] overflow-auto p-5 font-mono text-[10px] leading-5 text-slate-300">
              {comparison.diff ||
                "No textual diff was returned."}
            </pre>
          </section>
        </>
      )}
    </div>
  )
}


function DoctorReports({
  activeRepository,
  repositoryMetrics,
  diagnosis,
  changeResult,
  testChangeResult,
  chatMessages,
}: {
  activeRepository: Repository | null
  repositoryMetrics: RepositoryMetrics | null
  diagnosis: DiagnosisResult | null
  changeResult: ChangeResult | null
  testChangeResult: TestChangeResult | null
  chatMessages: ChatMessage[]
}) {
  const testResults = testChangeResult?.test_results
  const changeInterpretation = changeResult?.interpretation

  const overallStatus = useMemo(() => {
    if (testResults && testResults.failed > 0) {
      return {
        label: "REGRESSION DETECTED",
        detail: "Targeted validation found a failing test.",
        tone: "red",
      }
    }

    if (testResults && testResults.total > 0) {
      return {
        label: "VALIDATION COMPLETE",
        detail: "Targeted validation completed without failures.",
        tone: "green",
      }
    }

    if (changeInterpretation) {
      return {
        label: "CHANGE ASSESSED",
        detail: "Git change analysis is available for this repository.",
        tone: "amber",
      }
    }

    if (diagnosis) {
      return {
        label: "DIAGNOSIS AVAILABLE",
        detail: "Repository-grounded diagnosis is available.",
        tone: "blue",
      }
    }

    return {
      label: "REPORT IN PROGRESS",
      detail: "Run a diagnosis, change analysis, or test validation to populate this report.",
      tone: "slate",
    }
  }, [diagnosis, changeInterpretation, testResults])

  const confidence = useMemo(() => {
    const values: number[] = []

    if (diagnosis) {
      values.push(diagnosis.confidence)
    }

    if (changeInterpretation) {
      values.push(changeInterpretation.confidence)
    }

    if (!values.length) return null

    return Math.round(
      values.reduce((sum, value) => sum + value, 0) / values.length,
    )
  }, [diagnosis, changeInterpretation])

  const risk = useMemo(() => {
    if (testResults && testResults.failed > 0) return "High"
    if (changeInterpretation?.regression_risk) {
      return changeInterpretation.regression_risk
    }
    if (diagnosis?.risk) return diagnosis.risk
    return "Not assessed"
  }, [diagnosis, changeInterpretation, testResults])

  const evidenceCount =
    (diagnosis?.evidence.length ?? 0) +
    (changeResult?.comparison.changed_files.length ?? 0) +
    (changeResult?.comparison.changed_symbols.length ?? 0) +
    (testChangeResult?.test_selection.selected_tests.length ?? 0) +
    chatMessages.filter((message) => message.role === "doctor").length

  const statusClasses = {
    red: "border-red-200 bg-red-50 text-red-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
  } as const

  const statusClass =
    statusClasses[overallStatus.tone as keyof typeof statusClasses]

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex items-start gap-4">
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-50 to-violet-50 text-blue-600">
              <FileCode2 size={23} />
              <span className="pulse-ring absolute inset-0 rounded-xl border border-blue-300" />
            </div>

            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-blue-600">
                Repository-grounded report
              </p>
              <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-800">
                Doctor's Note
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Evidence-backed summary of diagnosis, changes, impact, and validation.
              </p>
            </div>
          </div>

          {activeRepository && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
              <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">
                Active repository
              </p>
              <p className="mt-1 text-sm font-bold text-slate-700">
                {activeRepository.name}
              </p>
              <p className="mt-1 text-[10px] text-slate-400">
                {activeRepository.git_available ? "Git available" : "No Git history"}
              </p>
            </div>
          )}
        </div>

        <div className={`mt-6 rounded-xl border px-4 py-4 ${statusClass}`}>
          <div className="flex items-start gap-3">
            {overallStatus.tone === "red" ? (
              <AlertTriangle size={19} className="mt-0.5 shrink-0" />
            ) : (
              <ShieldCheck size={19} className="mt-0.5 shrink-0" />
            )}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em]">
                {overallStatus.label}
              </p>
              <p className="mt-1 text-sm font-semibold">
                {overallStatus.detail}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">
              Doctor confidence
            </p>
            <Brain size={18} className="text-blue-500" />
          </div>
          <p className="mt-3 text-3xl font-extrabold text-slate-800">
            {confidence === null ? "—" : `${confidence}%`}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Based on available analysis outputs
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">
              Risk
            </p>
            <AlertTriangle size={18} className="text-amber-500" />
          </div>
          <p className="mt-3 text-3xl font-extrabold text-slate-800">
            {risk}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Derived from diagnosis/change/test evidence
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">
              Evidence items
            </p>
            <Activity size={18} className="text-emerald-500" />
          </div>
          <p className="mt-3 text-3xl font-extrabold text-slate-800">
            {evidenceCount}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Repository-backed observations
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">
              Validation
            </p>
            <TestTube2 size={18} className="text-violet-500" />
          </div>
          <p className="mt-3 text-3xl font-extrabold text-slate-800">
            {testResults
              ? `${testResults.passed}/${testResults.total}`
              : "—"}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Targeted tests executed
          </p>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Stethoscope size={19} />
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-blue-600">
                Diagnosis
              </p>
              <h3 className="text-lg font-extrabold text-slate-800">
                Doctor's assessment
              </h3>
            </div>
          </div>

          {diagnosis ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-sm leading-6 text-slate-600">
                  {diagnosis.diagnosis}
                </p>
              </div>

              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">
                  Reported problem
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-700">
                  {diagnosis.problem}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">
                    Confidence
                  </p>
                  <p className="mt-2 text-xl font-extrabold text-slate-800">
                    {diagnosis.confidence}%
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">
                    Risk
                  </p>
                  <p className="mt-2 text-xl font-extrabold text-slate-800">
                    {diagnosis.risk}
                  </p>
                </div>
              </div>

              {diagnosis.affected_files.length > 0 && (
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">
                    Affected files
                  </p>
                  <div className="mt-2 space-y-2">
                    {diagnosis.affected_files.map((file) => (
                      <div
                        key={file}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600"
                      >
                        {file}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-400">
              No diagnosis has been generated in the current session.
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
              <GitBranch size={19} />
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-violet-600">
                Change assessment
              </p>
              <h3 className="text-lg font-extrabold text-slate-800">
                What changed
              </h3>
            </div>
          </div>

          {changeResult ? (
            <div className="mt-5 space-y-4">
              <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-4">
                <span className="rounded-lg bg-blue-100 px-2.5 py-1 font-mono text-xs font-bold text-blue-700">
                  {changeResult.comparison.from_commit}
                </span>
                <ArrowRight size={16} className="text-slate-400" />
                <span className="rounded-lg bg-violet-100 px-2.5 py-1 font-mono text-xs font-bold text-violet-700">
                  {changeResult.comparison.to_commit}
                </span>
              </div>

              {changeInterpretation && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-amber-700">
                    Regression assessment
                  </p>
                  <p className="mt-2 text-sm leading-6 text-amber-900">
                    {changeInterpretation.regression_risk}
                  </p>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">
                    Files
                  </p>
                  <p className="mt-2 text-2xl font-extrabold text-slate-800">
                    {changeResult.comparison.changed_files.length}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">
                    Symbols
                  </p>
                  <p className="mt-2 text-2xl font-extrabold text-slate-800">
                    {changeResult.comparison.changed_symbols.length}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">
                    Impacts
                  </p>
                  <p className="mt-2 text-2xl font-extrabold text-slate-800">
                    {changeResult.comparison.impacts.length}
                  </p>
                </div>
              </div>

              {changeInterpretation?.summary && (
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">
                    Doctor interpretation
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {changeInterpretation.summary}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-400">
              No Git change analysis has been generated in the current session.
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <TestTube2 size={19} />
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-emerald-600">
                Validation
              </p>
              <h3 className="text-lg font-extrabold text-slate-800">
                Test execution
              </h3>
            </div>
          </div>

          {testChangeResult && testResults ? (
            <div className="mt-5 space-y-4">
              <div
                className={`rounded-xl border p-4 ${
                  testResults.failed > 0
                    ? "border-red-200 bg-red-50"
                    : "border-emerald-200 bg-emerald-50"
                }`}
              >
                <p
                  className={`text-[10px] font-bold uppercase tracking-[0.16em] ${
                    testResults.failed > 0
                      ? "text-red-700"
                      : "text-emerald-700"
                  }`}
                >
                  {testResults.failed > 0
                    ? "Regression detected"
                    : "Validation passed"}
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-700">
                  {testResults.passed} passed, {testResults.failed} failed,{" "}
                  {testResults.skipped} skipped, {testResults.errors} errors.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-[9px] uppercase tracking-[0.12em] text-slate-400">
                    Passed
                  </p>
                  <p className="mt-1 text-xl font-extrabold text-emerald-600">
                    {testResults.passed}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-[9px] uppercase tracking-[0.12em] text-slate-400">
                    Failed
                  </p>
                  <p className="mt-1 text-xl font-extrabold text-red-600">
                    {testResults.failed}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-[9px] uppercase tracking-[0.12em] text-slate-400">
                    Pass rate
                  </p>
                  <p className="mt-1 text-xl font-extrabold text-slate-800">
                    {testResults.pass_rate}%
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-[9px] uppercase tracking-[0.12em] text-slate-400">
                    Exit code
                  </p>
                  <p className="mt-1 text-xl font-extrabold text-slate-800">
                    {testResults.exit_code}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">
                  Selected tests
                </p>
                <div className="mt-2 space-y-2">
                  {testChangeResult.test_selection.selected_tests.map(
                    (target) => (
                      <div
                        key={target}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600"
                      >
                        {target}
                      </div>
                    ),
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-400">
              No targeted test execution has been recorded in the current session.
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
              <Database size={19} />
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-slate-500">
                Repository snapshot
              </p>
              <h3 className="text-lg font-extrabold text-slate-800">
                Evidence context
              </h3>
            </div>
          </div>

          {activeRepository ? (
            <div className="mt-5 space-y-3">
              <div className="rounded-xl border border-slate-200 p-4">
                <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">
                  Repository path
                </p>
                <p className="mt-2 break-all font-mono text-xs text-slate-600">
                  {activeRepository.local_path}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="text-[9px] uppercase tracking-[0.14em] text-slate-400">
                    Files
                  </p>
                  <p className="mt-2 text-2xl font-extrabold text-slate-800">
                    {repositoryMetrics?.repository.files ??
                      activeRepository.file_count}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="text-[9px] uppercase tracking-[0.14em] text-slate-400">
                    Indexed chunks
                  </p>
                  <p className="mt-2 text-2xl font-extrabold text-slate-800">
                    {repositoryMetrics?.repository.indexed_chunks ??
                      activeRepository.indexed_chunks}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">
                  Grounding policy
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  This report only displays results produced by the Repository Doctor
                  during the current session. Missing analyses are shown as unavailable
                  rather than being invented.
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-400">
              Select a repository to generate a repository-grounded report.
            </div>
          )}
        </section>
      </div>

      {changeInterpretation?.recommended_tests &&
        changeInterpretation.recommended_tests.length > 0 && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <ShieldCheck size={19} />
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-emerald-600">
                  Recommended validation
                </p>
                <h3 className="text-lg font-extrabold text-slate-800">
                  Doctor recommendations
                </h3>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {changeInterpretation.recommended_tests.map((recommendation, index) => (
                <div
                  key={`${recommendation}-${index}`}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                >
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700">
                    {index + 1}
                  </span>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    {recommendation}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}
    </div>
  )
}

function TestMyChange({
  activeRepository,
  fromCommit,
  toCommit,
  setFromCommit,
  setToCommit,
  loading,
  error,
  result,
  onTest,
  onDemo,
}: {
  activeRepository: Repository | null
  fromCommit: string
  toCommit: string
  setFromCommit: (value: string) => void
  setToCommit: (value: string) => void
  loading: boolean
  error: string
  result: TestChangeResult | null
  onTest: () => void
  onDemo: () => void
}) {
  const testResults = result?.test_results
  const selection = result?.test_selection

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex items-start gap-4">
            <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-50 to-blue-50 text-emerald-600">
              <TestTube2 size={21} />
              <span className="pulse-ring absolute inset-0 rounded-xl border border-emerald-300" />
            </div>

            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-600">
                Targeted Regression Testing
              </p>
              <h3 className="mt-1 text-xl font-extrabold tracking-tight text-slate-900">
                Test My Change
              </h3>
              <p className="mt-1 max-w-2xl text-[11px] leading-5 text-slate-500">
                Use Git impact analysis to identify tests related to changed
                symbols, then execute only those tests against the repository.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-right">
            <p className="text-[8px] font-bold uppercase tracking-[0.14em] text-slate-400">
              Active repository
            </p>
            <p className="mt-1 max-w-[260px] truncate text-[10px] font-bold text-slate-700">
              {activeRepository?.name ?? "No repository selected"}
            </p>
          </div>
        </div>

        {!activeRepository && (
          <div className="mt-5 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-[10px] text-amber-700">
            <AlertTriangle size={15} />
            Select a repository before running targeted regression tests.
          </div>
        )}

        {activeRepository && !activeRepository.git_available && (
          <div className="mt-5 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-[10px] text-amber-700">
            <AlertTriangle size={15} />
            This repository does not have Git history. Test My Change requires
            two commits to compare.
          </div>
        )}

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <CommitInput
            label="From commit"
            hint="Older / source"
            value={fromCommit}
            onChange={setFromCommit}
            placeholder="98efbb9"
            disabled={loading}
          />

          <CommitInput
            label="To commit"
            hint="Newer / target"
            value={toCommit}
            onChange={setToCommit}
            placeholder="34cac1f"
            disabled={loading}
          />
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-[10px] leading-5 text-red-700">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onTest}
            disabled={
              loading ||
              !activeRepository ||
              !activeRepository.git_available
            }
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-blue-600 px-5 py-3 text-[11px] font-bold text-white shadow-lg shadow-emerald-500/20 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <TestTube2 size={14} />
            )}
            {loading ? "Running targeted tests..." : "Test My Change"}
          </button>

          <button
            type="button"
            onClick={onDemo}
            disabled={loading}
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-[10px] font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Load demo regression
          </button>

          <div className="ml-auto flex items-center gap-2 text-[9px] text-slate-400">
            <ShieldCheck size={13} className="text-emerald-500" />
            Impact-analysis based test selection
          </div>
        </div>
      </section>

      {result && testResults && selection && (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <AnimatedMetric
              label="Selected Tests"
              value={selection.count}
              suffix=""
              description="Impact-analysis targets"
              icon={TestTube2}
              tone="blue"
            />

            <AnimatedMetric
              label="Tests Passed"
              value={testResults.passed}
              suffix={` / ${testResults.total}`}
              description={`${testResults.failed} failing test${testResults.failed === 1 ? "" : "s"}`}
              icon={ShieldCheck}
              tone="green"
            />

            <AnimatedMetric
              label="Pass Rate"
              value={testResults.pass_rate}
              suffix="%"
              description="Targeted regression suite"
              icon={Activity}
              tone={testResults.failed > 0 ? "orange" : "green"}
            />

            <AnimatedMetric
              label="Test Errors"
              value={testResults.errors}
              suffix=""
              description={
                testResults.skipped > 0
                  ? `${testResults.skipped} skipped`
                  : "No skipped tests"
              }
              icon={AlertTriangle}
              tone={testResults.errors > 0 ? "orange" : "blue"}
            />
          </section>

          <section className="grid gap-5 xl:grid-cols-[1.1fr_1fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-blue-600">
                    Test Selection
                  </p>
                  <h3 className="mt-1 text-sm font-bold text-slate-900">
                    Related tests selected by impact analysis
                  </h3>
                </div>

                <span className="rounded-full bg-blue-50 px-3 py-1.5 text-[8px] font-bold text-blue-600">
                  {selection.strategy}
                </span>
              </div>

              <div className="mt-5 space-y-2">
                {selection.selected_tests.length > 0 ? (
                  selection.selected_tests.map((test) => (
                    <div
                      key={test}
                      className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3"
                    >
                      <TestTube2
                        size={14}
                        className="mt-0.5 shrink-0 text-blue-500"
                      />
                      <span className="break-all font-mono text-[9px] leading-5 text-slate-600">
                        {test}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-[10px] text-slate-500">
                    No directly related tests were identified.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-emerald-600">
                    Execution Summary
                  </p>
                  <h3 className="mt-1 text-sm font-bold text-slate-900">
                    Actual pytest results
                  </h3>
                </div>

                <span
                  className={`rounded-full px-3 py-1.5 text-[8px] font-bold ${
                    testResults.failed > 0 || testResults.errors > 0
                      ? "bg-red-50 text-red-600"
                      : "bg-emerald-50 text-emerald-600"
                  }`}
                >
                  {testResults.failed > 0 || testResults.errors > 0
                    ? "REGRESSION DETECTED"
                    : "PASSING"}
                </span>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-slate-400">
                    Passed
                  </p>
                  <p className="mt-1 text-2xl font-extrabold text-emerald-600">
                    {testResults.passed}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-slate-400">
                    Failed
                  </p>
                  <p className="mt-1 text-2xl font-extrabold text-red-600">
                    {testResults.failed}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-slate-400">
                    Skipped
                  </p>
                  <p className="mt-1 text-2xl font-extrabold text-slate-600">
                    {testResults.skipped}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-slate-400">
                    Errors
                  </p>
                  <p className="mt-1 text-2xl font-extrabold text-orange-600">
                    {testResults.errors}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                <span className="text-[9px] text-slate-500">
                  Exit code
                </span>
                <span className="font-mono text-[10px] font-bold text-slate-700">
                  {testResults.exit_code}
                </span>
              </div>
            </div>
          </section>

          {testResults.failed > 0 || testResults.errors > 0 ? (
            <section className="overflow-hidden rounded-2xl border border-red-200 bg-white shadow-sm">
              <div className="flex items-center gap-3 border-b border-red-100 bg-red-50 px-5 py-4">
                <AlertTriangle size={16} className="text-red-600" />
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-red-600">
                    Regression Evidence
                  </p>
                  <h3 className="mt-1 text-sm font-bold text-red-900">
                    Targeted tests exposed a failing change
                  </h3>
                </div>
              </div>

              <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap p-5 font-mono text-[9px] leading-5 text-slate-600">
                {testResults.output || "No test output was returned."}
              </pre>
            </section>
          ) : (
            <section className="flex items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-sm">
                <ShieldCheck size={19} />
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-emerald-600">
                  Regression Check Passed
                </p>
                <p className="mt-1 text-sm font-bold text-emerald-900">
                  All selected tests passed for this change.
                </p>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function CommitInput({
  label,
  hint,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  label: string
  hint: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  disabled: boolean
}) {
  return (
    <label className="block">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">
          {label}
        </span>

        <span className="text-[8px] text-slate-400">
          {hint}
        </span>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 transition focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100">
        <GitBranch
          size={14}
          className="shrink-0 text-slate-400"
        />

        <input
          value={value}
          onChange={(event) =>
            onChange(event.target.value)
          }
          disabled={disabled}
          placeholder={placeholder}
          className="h-11 min-w-0 flex-1 bg-transparent font-mono text-sm text-slate-700 outline-none placeholder:text-slate-300 disabled:opacity-50"
        />
      </div>
    </label>
  )
}

function ChangeMetric({
  label,
  value,
  suffix = "",
  icon: Icon,
  detail,
}: {
  label: string
  value: number
  suffix?: string
  icon: typeof FileCode2
  detail: string
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <Icon size={17} />
        </div>

        <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400">
          Analysis
        </span>
      </div>

      <p className="mt-4 text-[10px] font-semibold text-slate-500">
        {label}
      </p>

      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-3xl font-extrabold tracking-tight text-slate-800">
          {value}
        </span>

        {suffix && (
          <span className="text-xs font-bold text-slate-400">
            {suffix}
          </span>
        )}
      </div>

      <p className="mt-1 text-[9px] text-slate-400">
        {detail}
      </p>
    </div>
  )
}

function RiskBadge({
  value,
}: {
  value: string
}) {
  const normalized =
    value.toLowerCase()

  const isHigh =
    normalized.includes("high")

  const isMedium =
    normalized.includes("medium")

  return (
    <span
      className={`rounded-full px-3 py-1.5 text-[9px] font-bold uppercase ${
        isHigh
          ? "bg-red-50 text-red-600"
          : isMedium
            ? "bg-amber-50 text-amber-600"
            : "bg-emerald-50 text-emerald-600"
      }`}
    >
      {value}
    </span>
  )
}

function CommitCard({
  label,
  commit,
  description,
}: {
  label: string
  commit: string
  description: string
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-blue-100 px-2 py-1 text-[8px] font-bold text-blue-600">
          {label}
        </span>

        <span className="text-[8px] text-slate-400">
          {description}
        </span>
      </div>

      <p className="mt-3 break-all font-mono text-[11px] font-bold text-slate-700">
        {commit}
      </p>
    </div>
  )
}

function RepositoryManagerModal({
  repositories,
  activeRepository,
  loading,
  error,
  actionId,
  onClose,
  onRefresh,
  onSelect,
  onIndex,
  onAdd,
}: {
  repositories: Repository[]
  activeRepository: Repository | null
  loading: boolean
  error: string
  actionId: string | null
  onClose: () => void
  onRefresh: () => void
  onSelect: (id: string) => void
  onIndex: (id: string) => void
  onAdd: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
      <div className="max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-blue-500">
              Workspace
            </p>

            <h3 className="mt-1 text-lg font-extrabold text-slate-800">
              Your Repositories
            </h3>

            <p className="mt-1 text-xs text-slate-400">
              Manage the repositories Doctor can
              analyze.
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-6">
          {error && (
            <div className="mb-4 rounded-xl border border-red-100 bg-red-50 p-4 text-xs text-red-600">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex min-h-[180px] items-center justify-center gap-2 text-sm text-slate-400">
              <Loader2
                size={17}
                className="animate-spin text-blue-500"
              />
              Loading repositories...
            </div>
          ) : repositories.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-10 text-center">
              <FolderGit2
                size={30}
                className="mx-auto mb-4 text-slate-300"
              />

              <p className="text-sm font-bold text-slate-600">
                No repositories added
              </p>

              <p className="mt-2 text-xs text-slate-400">
                Add a local project folder or ZIP
                repository.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {repositories.map(
                (repository) => {
                  const isActive =
                    activeRepository?.id ===
                    repository.id

                  const isBusy =
                    actionId === repository.id

                  return (
                    <div
                      key={repository.id}
                      className={`rounded-xl border p-4 transition ${
                        isActive
                          ? "border-blue-200 bg-blue-50/50"
                          : "border-slate-100 bg-slate-50/50"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-blue-500 shadow-sm">
                            <FolderGit2 size={17} />
                          </div>

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-bold text-slate-700">
                                {repository.name}
                              </p>

                              {isActive && (
                                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[8px] font-bold text-blue-600">
                                  ACTIVE
                                </span>
                              )}

                              <IndexingBadge
                                status={
                                  repository.indexing_status
                                }
                              />
                            </div>

                            <p
                              title={
                                repository.local_path
                              }
                              className="mt-1 max-w-[550px] truncate font-mono text-[9px] text-slate-400"
                            >
                              {
                                repository.local_path
                              }
                            </p>

                            <div className="mt-3 flex flex-wrap gap-4 text-[9px] text-slate-400">
                              <span>
                                {
                                  repository.file_count
                                }{" "}
                                files
                              </span>

                              <span>
                                {
                                  repository.indexed_chunks
                                }{" "}
                                indexed chunks
                              </span>

                              <span className="capitalize">
                                {
                                  repository.source_type
                                }{" "}
                                repository
                              </span>

                              {repository.git_available && (
                                <span>
                                  Git available
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          {!isActive && (
                            <button
                              onClick={() =>
                                onSelect(
                                  repository.id,
                                )
                              }
                              disabled={isBusy}
                              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[9px] font-bold text-slate-600 hover:border-blue-200 disabled:opacity-40"
                            >
                              {isBusy ? (
                                <Loader2
                                  size={13}
                                  className="animate-spin"
                                />
                              ) : (
                                "Select"
                              )}
                            </button>
                          )}

                          <button
                            onClick={() =>
                              onIndex(
                                repository.id,
                              )
                            }
                            disabled={isBusy}
                            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[9px] font-bold text-slate-600 hover:border-blue-200 disabled:opacity-40"
                          >
                            {isBusy ? (
                              <Loader2
                                size={13}
                                className="animate-spin"
                              />
                            ) : (
                              <RefreshCw
                                size={13}
                              />
                            )}

                            Re-index
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                },
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-6 py-5">
          <button
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-40"
          >
            <RefreshCw size={14} />
            Refresh
          </button>

          <button
            onClick={onAdd}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-blue-500/20"
          >
            <Plus size={15} />
            Add Repository
          </button>
        </div>
      </div>
    </div>
  )
}

function AddRepositoryModal({
  path,
  setPath,
  loading,
  error,
  onClose,
  onAdd,
  onUpload,
}: {
  path: string
  setPath: (value: string) => void
  loading: boolean
  error: string
  onClose: () => void
  onAdd: () => void
  onUpload: (file: File) => void
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-blue-500">
              Repository Manager
            </p>

            <h3 className="mt-1 text-lg font-extrabold text-slate-800">
              Add Repository
            </h3>
          </div>

          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <FolderGit2 size={21} />
          </div>

          <h4 className="font-bold text-slate-800">
            Connect a project
          </h4>

          <p className="mt-2 text-xs leading-6 text-slate-400">
            Add an existing local project folder or
            upload a ZIP repository. Git is optional for
            repository analysis.
          </p>

          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-bold text-slate-600">
              Local project folder
            </p>

            <input
              autoFocus
              value={path}
              onChange={(event) =>
                setPath(event.target.value)
              }
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !loading
                ) {
                  onAdd()
                }
              }}
              placeholder="D:\Projects\my-repository"
              className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />

            <p className="mt-2 text-[9px] text-slate-400">
              Works with Git and non-Git project
              folders.
            </p>
          </div>

          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-100" />
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
              or
            </span>
            <div className="h-px flex-1 bg-slate-100" />
          </div>

          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-blue-200 bg-blue-50/50 p-4 transition hover:bg-blue-50">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
              <Upload size={17} />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-slate-700">
                Upload ZIP repository
              </p>

              <p className="mt-1 text-[9px] text-slate-400">
                Doctor will extract and register the
                project automatically.
              </p>
            </div>

            <input
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              disabled={loading}
              onChange={(event) => {
                const file =
                  event.target.files?.[0]

                if (file) {
                  onUpload(file)
                }

                event.currentTarget.value = ""
              }}
            />
          </label>

          {error && (
            <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-4 text-xs leading-5 text-red-600">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-5">
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-xl px-4 py-2.5 text-xs font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-40"
          >
            Cancel
          </button>

          <button
            onClick={onAdd}
            disabled={
              !path.trim() || loading
            }
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-blue-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading && (
              <Loader2
                size={14}
                className="animate-spin"
              />
            )}

            {loading
              ? "Processing..."
              : "Add Repository"}
          </button>
        </div>
      </div>
    </div>
  )
}

function IndexingBadge({
  status,
}: {
  status: string
}) {
  const normalizedStatus =
    status.toUpperCase()

  const config =
    {
      INDEXED: {
        label: "Indexed",
        className:
          "bg-emerald-50 text-emerald-600",
        dot: "bg-emerald-500",
      },
      INDEXING: {
        label: "Indexing",
        className:
          "bg-blue-50 text-blue-600",
        dot: "bg-blue-500",
      },
      FAILED: {
        label: "Failed",
        className:
          "bg-red-50 text-red-600",
        dot: "bg-red-500",
      },
      NOT_INDEXED: {
        label: "Not indexed",
        className:
          "bg-amber-50 text-amber-600",
        dot: "bg-amber-500",
      },
    }[normalizedStatus] ?? {
      label: normalizedStatus,
      className:
        "bg-slate-100 text-slate-500",
      dot: "bg-slate-400",
    }

  return (
    <span
      className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-[8px] font-bold uppercase tracking-wider ${config.className}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${config.dot}`}
      />

      {config.label}
    </span>
  )
}

function ProblemDiagnosis({
  problem,
  setProblem,
  setDiagnosed,
  diagnosed,
  diagnosis,
  loading,
  error,
  onDiagnose,
}: {
  problem: string
  setProblem: (value: string) => void
  setDiagnosed: (value: boolean) => void
  diagnosed: boolean
  diagnosis: DiagnosisResult | null
  loading: boolean
  error: string
  onDiagnose: () => void
}) {
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-start gap-4">
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-50 to-violet-50 text-blue-600">
            <Stethoscope size={21} />
            <span className="pulse-ring absolute inset-0 rounded-xl border border-blue-300" />
          </div>

          <div>
            <h3 className="text-lg font-extrabold text-slate-800">
              Describe the problem
            </h3>

            <p className="mt-1 text-sm text-slate-400">
              Tell Doctor what is going wrong. Doctor
              will use your repository context to
              investigate the issue.
            </p>
          </div>
        </div>

        <div className="relative">
          <textarea
            value={problem}
            onChange={(event) => {
              setProblem(event.target.value)
              setDiagnosed(false)
            }}
            placeholder="Example: Login fails after the latest authentication change..."
            className="min-h-[190px] w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm leading-7 text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />

          <div className="pointer-events-none absolute bottom-4 right-4 text-[9px] text-slate-400">
            {problem.length} characters
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Search size={14} />
            Repository context will be searched
            automatically
          </div>

          <button
            onClick={onDiagnose}
            disabled={
              !problem.trim() || loading
            }
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? (
              <Loader2
                size={16}
                className="animate-spin"
              />
            ) : (
              <Send size={16} />
            )}

            {loading
              ? "Doctor is analyzing..."
              : "Diagnose Problem"}
          </button>
        </div>

        {loading && (
          <div className="mt-5 overflow-hidden rounded-xl border border-blue-100 bg-blue-50/60 p-4">
            <div className="flex items-center gap-3 text-xs font-bold text-blue-700">
              <Loader2
                size={15}
                className="animate-spin"
              />
              Doctor is investigating repository
              evidence...
            </div>

            <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-blue-100">
              <div className="scan-line absolute inset-y-0 left-0 w-1/3 rounded-full bg-blue-500" />
            </div>
          </div>
        )}

        {error && (
          <div className="mt-5 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">
            {error}
          </div>
        )}
      </section>

      {diagnosed && diagnosis && (
        <section className="grid gap-5 xl:grid-cols-[1fr_1.4fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                <Search size={18} />
              </div>

              <div>
                <p className="text-xs text-slate-400">
                  Repository Context
                </p>

                <h3 className="mt-1 font-bold text-slate-800">
                  Relevant evidence
                </h3>
              </div>
            </div>

            <div className="space-y-3">
              {diagnosis.affected_files.map(
                (file, index) => (
                  <EvidenceFile
                    key={file}
                    file={file}
                    reason={
                      index === 0
                        ? "Primary affected module"
                        : index === 1
                          ? "Related module"
                          : "Related regression tests"
                    }
                    score={`${Math.max(
                      86,
                      94 - index * 5,
                    )}%`}
                  />
                ),
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/70 to-violet-50/60 p-6 shadow-sm">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                  <Microscope size={18} />
                </div>

                <div>
                  <p className="text-xs text-slate-400">
                    Doctor's Assessment
                  </p>

                  <h3 className="mt-1 font-bold text-slate-800">
                    AI diagnosis result
                  </h3>
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <div className="rounded-full bg-emerald-50 px-3 py-1.5 text-[9px] font-bold text-emerald-600">
                  {diagnosis.confidence}%
                  confidence
                </div>

                <div
                  className={`rounded-full px-3 py-1.5 text-[9px] font-bold ${
                    diagnosis.risk === "HIGH"
                      ? "bg-red-50 text-red-600"
                      : diagnosis.risk ===
                          "MEDIUM"
                        ? "bg-amber-50 text-amber-600"
                        : "bg-emerald-50 text-emerald-600"
                  }`}
                >
                  {diagnosis.risk} risk
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="mb-3 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">
                Diagnosis
              </p>

              <p className="text-sm leading-7 text-slate-600">
                {diagnosis.diagnosis}
              </p>
            </div>

            <div className="mt-6">
              <p className="mb-3 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">
                Potentially affected files
              </p>

              <div className="space-y-2">
                {diagnosis.affected_files.map(
                  (file, index) => (
                    <AffectedFile
                      key={file}
                      file={file}
                      impact={
                        index === 0
                          ? "Primary"
                          : index ===
                              diagnosis
                                .affected_files
                                .length -
                                1
                            ? "Regression"
                            : "Related"
                      }
                    />
                  ),
                )}
              </div>
            </div>

            <div className="mt-6 border-t border-slate-200 pt-5">
              <p className="mb-3 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">
                Evidence
              </p>

              <div className="space-y-3">
                {diagnosis.evidence.map(
                  (item, index) => (
                    <div
                      key={index}
                      className="rounded-xl border border-slate-200 bg-white p-4"
                    >
                      <p className="mb-2 text-[9px] font-bold text-cyan-600">
                        EVIDENCE{" "}
                        {String(
                          index + 1,
                        ).padStart(2, "0")}
                      </p>

                      <p className="text-sm leading-6 text-slate-500">
                        {item}
                      </p>
                    </div>
                  ),
                )}
              </div>
            </div>

            <div className="mt-6 border-t border-slate-200 pt-5">
              <p className="mb-3 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">
                Recommended next steps
              </p>

              <ol className="space-y-3">
                {diagnosis.recommendations.map(
                  (recommendation, index) => (
                    <Recommendation
                      key={index}
                      number={`0${
                        index + 1
                      }`}
                      text={
                        recommendation
                      }
                    />
                  ),
                )}
              </ol>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

function EvidenceFile({
  file,
  reason,
  score,
}: {
  file: string
  reason: string
  score: string
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex items-center gap-3">
        <FileCode2
          size={16}
          className="text-blue-500"
        />

        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold text-slate-700">
            {file}
          </p>

          <p className="mt-1 text-[9px] text-slate-400">
            {reason}
          </p>
        </div>

        <span className="text-[9px] font-bold text-blue-600">
          {score}
        </span>
      </div>
    </div>
  )
}

function AffectedFile({
  file,
  impact,
}: {
  file: string
  impact: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2.5">
      <FileCode2
        size={14}
        className="text-slate-400"
      />

      <span className="flex-1 font-mono text-[10px] text-slate-500">
        {file}
      </span>

      <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400">
        {impact}
      </span>
    </div>
  )
}

function Recommendation({
  number,
  text,
}: {
  number: string
  text: string
}) {
  return (
    <li className="flex gap-3">
      <span className="font-mono text-[10px] font-bold text-blue-600">
        {number}
      </span>

      <span className="text-xs leading-5 text-slate-500">
        {text}
      </span>
    </li>
  )
}

function DoctorChat({
  activeRepository,
  messages,
  input,
  setInput,
  loading,
  error,
  onSend,
}: {
  activeRepository: Repository | null
  messages: ChatMessage[]
  input: string
  setInput: (value: string) => void
  loading: boolean
  error: string
  onSend: () => void
}) {
  const suggestions = [
    "Where is task completion implemented?",
    "Why does completing a task remove its priority?",
    "Explain the failing test in this repository.",
    "What could cause KeyError: priority?",
  ]

  return (
    <div className="grid gap-5 xl:grid-cols-[1.6fr_.8fr]">
      <section className="flex min-h-[650px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_16px_50px_rgba(37,99,235,.08)]">
        <div className="border-b border-slate-100 bg-gradient-to-r from-blue-50 via-white to-violet-50 px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-lg shadow-blue-500/20">
                <MessageSquareCode size={20} />
                <span className="pulse-ring absolute inset-0 rounded-xl border-2 border-blue-400/60" />
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-extrabold text-slate-800">
                    Doctor Chat
                  </h3>

                  <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[8px] font-bold text-emerald-600">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                    LIVE
                  </span>
                </div>

                <p className="mt-0.5 text-[10px] text-slate-400">
                  Repository-grounded AI assistance
                  for errors, code questions and
                  debugging.
                </p>
              </div>
            </div>

            <div className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 sm:flex">
              <GitBranch
                size={13}
                className="text-blue-500"
              />

              <span className="max-w-[180px] truncate text-[9px] font-bold text-slate-600">
                {activeRepository?.name ??
                  "No repository"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-50/50 p-5">
          {messages.length === 0 ? (
            <div className="flex min-h-[430px] items-center justify-center">
              <div className="max-w-xl text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-100 to-violet-100 text-blue-600 shadow-sm">
                  <Brain size={29} />
                </div>

                <h4 className="mt-5 text-xl font-extrabold text-slate-800">
                  Ask Doctor about your code
                </h4>

                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
                  Paste an error, traceback, test
                  failure, or ask a normal code
                  question. Doctor will search the
                  active repository before answering.
                </p>

                <div className="mt-6 grid gap-2 sm:grid-cols-2">
                  {suggestions.map(
                    (suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() =>
                          setInput(
                            suggestion,
                          )
                        }
                        className="rounded-xl border border-slate-200 bg-white p-3 text-left text-[10px] font-semibold leading-5 text-slate-500 transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50/50 hover:text-blue-700"
                      >
                        {suggestion}
                      </button>
                    ),
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-5">
              {messages.map((message) => (
                <ChatBubble
                  key={message.id}
                  message={message}
                />
              ))}

              {loading && (
                <div className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-xs font-semibold text-blue-700">
                  <Loader2
                    size={16}
                    className="animate-spin"
                  />

                  <span>
                    Doctor is retrieving evidence
                    and reasoning over your
                    repository...
                  </span>

                  <span className="ml-auto hidden items-center gap-1 sm:flex">
                    <i className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500" />
                    <i className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500 [animation-delay:120ms]" />
                    <i className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500 [animation-delay:240ms]" />
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 bg-white p-4">
          {error && (
            <div className="mb-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs leading-5 text-red-600">
              {error}
            </div>
          )}

          <div className="relative rounded-2xl border border-slate-200 bg-slate-50 p-2 transition focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100">
            <textarea
              value={input}
              onChange={(event) =>
                setInput(event.target.value)
              }
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey
                ) {
                  event.preventDefault()
                  onSend()
                }
              }}
              disabled={
                loading ||
                !activeRepository
              }
              placeholder={
                activeRepository
                  ? "Paste an error, traceback, log, or ask Doctor a code question..."
                  : "Select a repository to start chatting..."
              }
              className="min-h-[86px] w-full resize-none bg-transparent px-3 py-2 pr-14 text-sm leading-6 text-slate-700 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
            />

            <button
              onClick={onSend}
              disabled={
                !input.trim() ||
                loading ||
                !activeRepository
              }
              className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-lg shadow-blue-500/20 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-35"
              title="Send to Doctor"
            >
              {loading ? (
                <Loader2
                  size={16}
                  className="animate-spin"
                />
              ) : (
                <Send size={16} />
              )}
            </button>
          </div>

          <div className="mt-2 flex items-center justify-between px-1 text-[8px] text-slate-400">
            <span>
              Enter to send · Shift + Enter for a
              new line
            </span>

            <span className="flex items-center gap-1">
              <Database size={10} />
              Repository RAG enabled
            </span>
          </div>
        </div>
      </section>

      <aside className="space-y-5">
        <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-600 to-violet-600 p-5 text-white shadow-lg shadow-blue-500/15">
          <div className="flex items-center gap-2 text-blue-100">
            <Stethoscope size={16} />

            <span className="text-[9px] font-bold uppercase tracking-[0.16em]">
              Doctor Workspace
            </span>
          </div>

          <h3 className="mt-3 text-lg font-extrabold">
            Repository-aware diagnosis
          </h3>

          <p className="mt-2 text-[10px] leading-5 text-blue-100">
            Every question is routed through the
            active repository's indexed evidence
            before the AI generates its response.
          </p>

          <div className="mt-5 space-y-2">
            {[
              "Active repository",
              "RAG retrieval",
              "LLM reasoning",
              "Evidence-backed answer",
            ].map((item, index) => (
              <div
                key={item}
                className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/15 text-[8px] font-bold">
                  0{index + 1}
                </span>

                <span className="text-[9px] font-semibold">
                  {item}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Search
              size={15}
              className="text-blue-500"
            />

            <h3 className="text-sm font-bold text-slate-800">
              What Doctor can inspect
            </h3>
          </div>

          <div className="mt-4 space-y-2">
            {[
              ["Errors & tracebacks", AlertTriangle],
              ["Source code", FileCode2],
              ["Relevant tests", TestTube2],
              ["Repository context", Database],
            ].map(([label, Icon]) => {
              const ItemIcon =
                Icon as typeof FileCode2

              return (
                <div
                  key={String(label)}
                  className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3"
                >
                  <ItemIcon
                    size={14}
                    className="text-slate-500"
                  />

                  <span className="text-[10px] font-semibold text-slate-600">
                    {String(label)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {!activeRepository && (
          <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5 text-xs leading-5 text-amber-700">
            <p className="font-bold">
              No active repository
            </p>

            <p className="mt-1">
              Open Repository Manager and select or
              add a repository before asking Doctor a
              question.
            </p>
          </div>
        )}
      </aside>
    </div>
  )
}

function ChatBubble({
  message,
}: {
  message: ChatMessage
}) {
  const isUser =
    message.role === "user"

  return (
    <div
      className={`flex gap-3 ${
        isUser
          ? "justify-end"
          : "justify-start"
      }`}
    >
      {!isUser && (
        <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-sm">
          <Stethoscope size={16} />
        </div>
      )}

      <div
        className={`max-w-[88%] rounded-2xl p-4 shadow-sm ${
          isUser
            ? "bg-gradient-to-br from-blue-600 to-blue-500 text-white"
            : "border border-slate-200 bg-white text-slate-600"
        }`}
      >
        <div className="flex items-center gap-2">
          <span
            className={`text-[8px] font-bold uppercase tracking-[0.14em] ${
              isUser
                ? "text-blue-100"
                : "text-slate-400"
            }`}
          >
            {isUser ? "You" : "Doctor"}
          </span>

          {!isUser &&
            message.repositoryName && (
              <span className="rounded-full bg-blue-50 px-2 py-1 text-[7px] font-bold text-blue-600">
                {message.repositoryName}
              </span>
            )}
        </div>

        <p className="mt-2 whitespace-pre-wrap text-[12px] leading-6">
          {message.content}
        </p>

        {!isUser &&
          message.confidence !==
            undefined && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
              <span className="rounded-full bg-emerald-50 px-2.5 py-1.5 text-[8px] font-bold text-emerald-600">
                {message.confidence}%
                confidence
              </span>

              <span className="rounded-full bg-blue-50 px-2.5 py-1.5 text-[8px] font-bold text-blue-600">
                Repository grounded
              </span>
            </div>
          )}

        {!isUser &&
          message.evidence &&
          message.evidence.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <p className="mb-2 text-[8px] font-bold uppercase tracking-[0.14em] text-slate-400">
                Repository Evidence
              </p>

              <div className="space-y-2">
                {message.evidence.map(
                  (item, index) => (
                    <div
                      key={`${item}-${index}`}
                      className="flex gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3"
                    >
                      <FileCode2
                        size={13}
                        className="mt-0.5 shrink-0 text-blue-500"
                      />

                      <span className="break-words text-[9px] leading-5 text-slate-500">
                        {item}
                      </span>
                    </div>
                  ),
                )}
              </div>
            </div>
          )}
      </div>

    </div>
  )
}

function AskMyCodebase({
  activeRepository,
}: {
  activeRepository: Repository | null
}) {
  const [question, setQuestion] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [answer, setAnswer] = useState("")
  const [confidence, setConfidence] = useState<number | null>(null)
  const [evidence, setEvidence] = useState<string[]>([])
  const [askedQuestion, setAskedQuestion] = useState("")

  const suggestions = [
    "Where is task completion implemented?",
    "How is the application structured?",
    "Which files are responsible for data storage?",
    "What are the main modules and how do they interact?",
  ]

  const askCodebase = async (value?: string) => {
    const query = (value ?? question).trim()
    if (!query || loading) return
    if (!activeRepository) {
      setError("Select an active repository before asking about the codebase.")
      return
    }
    setLoading(true)
    setError("")
    setAnswer("")
    setConfidence(null)
    setEvidence([])
    setAskedQuestion(query)
    try {
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: query, repository_id: activeRepository.id }),
      })
      const rawData = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(rawData.detail ?? `Codebase query failed with status ${response.status}`)
      }
      const normalizedEvidence = Array.isArray(rawData.evidence)
        ? rawData.evidence.map((item: unknown) => {
            if (typeof item === "string") return item
            if (item && typeof item === "object") {
              const value = item as Record<string, unknown>
              return String(value.file_path ?? value.file ?? value.content ?? JSON.stringify(item))
            }
            return String(item)
          })
        : []
      setAnswer(rawData.answer ?? "Repository Doctor did not return an answer.")
      setConfidence(typeof rawData.confidence === "number" ? rawData.confidence : null)
      setEvidence(normalizedEvidence)
      setQuestion("")
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : "Repository Doctor could not answer this question.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Search size={19} />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-800">Ask My Codebase</h2>
              <p className="text-xs text-slate-400">Ask about architecture, functions, modules, dependencies, and implementation details.</p>
            </div>
          </div>
          {activeRepository ? (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="max-w-[260px] truncate text-xs font-bold text-emerald-700">{activeRepository.name}</span>
              <span className="text-[10px] font-semibold text-emerald-600">{activeRepository.indexing_status}</span>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">No repository selected</div>
          )}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-blue-600">Repository question</p>
          <h3 className="mt-1 text-base font-extrabold text-slate-800">What do you want to understand?</h3>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {suggestions.map((suggestion) => (
              <button key={suggestion} type="button" onClick={() => { setQuestion(suggestion); void askCodebase(suggestion) }} disabled={loading} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-left text-xs font-semibold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
                {suggestion}
              </button>
            ))}
          </div>
          <div className="mt-4">
            <textarea value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void askCodebase() } }} placeholder="Example: Where is authentication handled in this repository?" rows={6} disabled={loading} className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-50 disabled:opacity-60" />
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-[10px] text-slate-400">Ctrl + Enter to ask · Answers are grounded in retrieved repository evidence.</p>
              <button type="button" onClick={() => void askCodebase()} disabled={loading || !question.trim() || !activeRepository} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                {loading ? "Searching..." : "Ask Doctor"}
              </button>
            </div>
          </div>
          {error && <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs font-semibold text-red-600">{error}</div>}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-slate-400">Repository evidence</p>
              <h3 className="mt-1 text-base font-extrabold text-slate-800">Grounding used for the answer</h3>
            </div>
            {confidence !== null && <div className="rounded-xl bg-blue-50 px-3 py-2 text-center"><div className="text-lg font-black text-blue-700">{confidence}%</div><div className="text-[9px] font-bold uppercase tracking-wider text-blue-500">confidence</div></div>}
          </div>
          {askedQuestion && <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3"><p className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400">Question</p><p className="mt-1 text-xs font-semibold leading-5 text-slate-700">{askedQuestion}</p></div>}
          {answer ? (
            <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/40 p-4">
              <div className="flex items-center gap-2 text-blue-700"><Brain size={16} /><span className="text-xs font-extrabold">Repository Doctor</span></div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{answer}</p>
            </div>
          ) : (
            <div className="mt-4 flex min-h-[220px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 text-center">
              <div><Database className="mx-auto text-slate-300" size={28} /><p className="mt-3 text-sm font-bold text-slate-500">Ask a repository question to see the grounded answer.</p><p className="mt-1 text-xs text-slate-400">The response will be based on retrieved code from the selected repository.</p></div>
            </div>
          )}
          {evidence.length > 0 && <div className="mt-4"><div className="mb-2 flex items-center justify-between"><p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Evidence items</p><span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-500">{evidence.length} retrieved</span></div><div className="space-y-2">{evidence.map((item, index) => <div key={`${item}-${index}`} className="flex gap-3 rounded-xl border border-slate-100 bg-white p-3"><div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[9px] font-black text-slate-500">{index + 1}</div><span className="break-words text-[10px] leading-5 text-slate-600">{item}</span></div>)}</div></div>}
        </section>
      </div>
    </div>
  )
}

function PlaceholderPage({
  title,
}: {
  title: string
}) {
  return (
    <div className="flex min-h-[500px] items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <Brain size={25} />
        </div>

        <h3 className="text-xl font-extrabold text-slate-800">
          {title}
        </h3>

        <p className="mt-2 text-sm text-slate-400">
          This workspace will be built next.
        </p>
      </div>
    </div>
  )
}

function getPageDescription(
  page: string,
) {
  switch (page) {
    case "I Have a Problem":
      return "Describe an issue and let Doctor investigate your repository."

    case "Doctor Chat":
      return "Ask questions, paste errors, and debug against your active repository."

    case "What Changed?":
      return "Compare commits, understand code changes, inspect dependencies, and assess regression risk."

    case "Ask My Codebase":
      return "Ask questions and retrieve answers from your repository."

    case "Test My Change":
      return "Generate and execute relevant regression tests."

    case "Doctor Reports":
      return "Review diagnosis, evidence, risk, and validation reports."

    case "Settings":
      return "Configure your Repository Doctor workspace."

    default:
      return "Repository Doctor workspace."
  }
}

function countAdditions(
  files: ChangeFile[],
) {
  return files.reduce(
    (total, file) =>
      total + file.additions,
    0,
  )
}

export default App