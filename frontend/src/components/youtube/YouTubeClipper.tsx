import { useState, useRef, useEffect } from "react";
import { Send, ArrowLeft, Bot, User, Copy, Download, Loader, Play, Scissors, FileText, Settings, CheckCircle } from "lucide-react";
import { YouTubeSkill } from "../../pages/YouTubeStudioSimple";

interface Props {
  selectedSkill: YouTubeSkill;
  onBackToSkills: () => void;
}

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  type?: "progress" | "chapter-analysis" | "user-selection" | "processing" | "result";
}

type ClipperState = "initial" | "environment-check" | "download" | "analysis" | "user-selection" | "processing" | "completed";

interface Chapter {
  id: number;
  title: string;
  startTime: string;
  endTime: string;
  summary: string;
  keywords: string[];
  selected?: boolean;
}

interface ProcessingOptions {
  bilingual: boolean;
  burnSubtitles: boolean;
  generateSummary: boolean;
}

export function YouTubeClipper({ selectedSkill, onBackToSkills }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [clipperState, setClipperState] = useState<ClipperState>("initial");
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [processingOptions, setProcessingOptions] = useState<ProcessingOptions>({
    bilingual: true,
    burnSubtitles: true,
    generateSummary: true
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // 초기 메시지 추가
    const initialMessage: Message = {
      id: Date.now().toString(),
      role: "assistant",
      content: `안녕하세요! YouTube 클리퍼 전문가입니다. 🎬

이 도구는 YouTube 영상을 AI로 분석하여 의미 있는 클립을 자동으로 생성해드립니다.

**주요 기능:**
• 🤖 AI 기반 스마트 챕터 분석 (2-5분 단위)
• ✂️ 정확한 영상 클리핑  
• 🌐 이중언어 자막 생성 (영어 + 한국어)
• 🎞️ 자막 하드코딩 (영상에 직접 삽입)
• 📝 소셜미디어용 요약 문안 생성

시작하시려면 YouTube URL을 입력해주세요!`,
      timestamp: new Date(),
      type: "progress"
    };

    setMessages([initialMessage]);
  }, []);

  const addMessage = (content: string, role: "user" | "assistant" | "system" = "assistant", type?: Message["type"]) => {
    const newMessage: Message = {
      id: Date.now().toString() + Math.random(),
      role,
      content,
      timestamp: new Date(),
      type
    };
    setMessages(prev => [...prev, newMessage]);
    return newMessage;
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: inputValue,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    try {
      if (clipperState === "initial") {
        await handleInitialInput(userMessage.content);
      } else if (clipperState === "user-selection") {
        await handleChapterSelection(userMessage.content);
      } else {
        await handleGeneralQuery(userMessage.content);
      }
    } catch (error) {
      console.error("YouTube Clipper 처리 오류:", error);
      addMessage(`처리 중 오류가 발생했습니다: ${error instanceof Error ? error.message : "알 수 없는 오류"}`, "assistant");
    } finally {
      setIsLoading(false);
    }
  };

  const handleInitialInput = async (input: string) => {
    // YouTube URL 감지
    const youtubeRegex = /(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/;
    
    if (youtubeRegex.test(input)) {
      await startClippingProcess(input);
    } else {
      addMessage("올바른 YouTube URL을 입력해주세요. 예: https://youtube.com/watch?v=...", "assistant");
    }
  };

  const startClippingProcess = async (url: string) => {
    setClipperState("environment-check");
    
    addMessage("🔍 **1단계: 환경 검사**", "assistant", "progress");
    addMessage("필요한 도구들을 확인하고 있습니다...", "assistant", "progress");
    
    // 실제로는 백엔드 API 호출
    setTimeout(() => {
      addMessage("✅ yt-dlp 확인됨\n✅ FFmpeg 확인됨\n✅ Python 의존성 확인됨", "assistant", "progress");
      
      setClipperState("download");
      addMessage("📥 **2단계: 영상 다운로드**", "assistant", "progress");
      addMessage("YouTube 영상과 자막을 다운로드하고 있습니다...", "assistant", "progress");
      
      setTimeout(() => {
        addMessage("✅ **다운로드 완료!**\n\n📺 **영상 정보:**\n• 제목: AI의 미래와 AGI\n• 길이: 24:32\n• 해상도: 1080p\n• 파일 크기: 156 MB", "assistant", "progress");
        
        setClipperState("analysis");
        addMessage("🤖 **3단계: AI 챕터 분석**", "assistant", "progress");
        addMessage("자막 내용을 분석하여 의미 있는 챕터를 생성하고 있습니다...", "assistant", "progress");
        
        setTimeout(() => {
          const sampleChapters: Chapter[] = [
            {
              id: 1,
              title: "AI 발전의 현재 상황",
              startTime: "00:00",
              endTime: "03:45",
              summary: "현재 AI 기술의 발전 현황과 주요 돌파구들을 설명",
              keywords: ["AI", "기술발전", "현황", "돌파구"]
            },
            {
              id: 2,
              title: "AGI란 무엇인가",
              startTime: "03:45", 
              endTime: "07:20",
              summary: "인공일반지능(AGI)의 정의와 현재 AI와의 차이점 분석",
              keywords: ["AGI", "인공일반지능", "정의", "차이점"]
            },
            {
              id: 3,
              title: "AI의 미래 예측",
              startTime: "07:20",
              endTime: "11:30", 
              summary: "전문가들이 예측하는 AI의 미래 발전 방향과 시나리오",
              keywords: ["미래예측", "발전방향", "시나리오", "전문가"]
            },
            {
              id: 4,
              title: "사회적 영향과 준비",
              startTime: "11:30",
              endTime: "15:45",
              summary: "AI 발전이 사회에 미칠 영향과 우리가 준비해야 할 것들",
              keywords: ["사회영향", "준비", "변화", "대응"]
            },
            {
              id: 5,
              title: "AI 윤리와 안전",
              startTime: "15:45", 
              endTime: "20:10",
              summary: "AI 개발과 사용에서 고려해야 할 윤리적 문제와 안전 대책",
              keywords: ["AI윤리", "안전", "윤리", "대책"]
            },
            {
              id: 6,
              title: "결론 및 행동 지침",
              startTime: "20:10",
              endTime: "24:32",
              summary: "AI 시대를 맞이하는 우리의 자세와 구체적 행동 방안",
              keywords: ["결론", "행동지침", "자세", "방안"]
            }
          ];
          
          setChapters(sampleChapters);
          setClipperState("user-selection");
          
          addMessage("✅ **챕터 분석 완료!** 총 6개의 의미 있는 챕터를 발견했습니다.", "assistant", "chapter-analysis");
          addMessage(generateChapterDisplay(sampleChapters), "assistant", "chapter-analysis");
          addMessage("📋 **4단계: 클립 선택**\n\n원하시는 챕터 번호를 선택해주세요 (예: 1,3,5 또는 all)\n\n아래에서 처리 옵션도 설정하실 수 있습니다:", "assistant", "user-selection");
        }, 3000);
      }, 2000);
    }, 1500);
  };

  const generateChapterDisplay = (chapters: Chapter[]) => {
    return chapters.map(chapter => 
      `**${chapter.id}. [${chapter.startTime} - ${chapter.endTime}] ${chapter.title}**\n` +
      `📝 ${chapter.summary}\n` +
      `🏷️ ${chapter.keywords.join(', ')}\n`
    ).join('\n');
  };

  const handleChapterSelection = async (input: string) => {
    const selection = input.toLowerCase().trim();
    let selectedChapterIds: number[] = [];
    
    if (selection === 'all') {
      selectedChapterIds = chapters.map(c => c.id);
    } else {
      const ids = selection.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
      selectedChapterIds = ids.filter(id => chapters.find(c => c.id === id));
    }

    if (selectedChapterIds.length === 0) {
      addMessage("올바른 챕터 번호를 입력해주세요. 예: 1,3,5 또는 all", "assistant");
      return;
    }

    const updatedChapters = chapters.map(chapter => ({
      ...chapter,
      selected: selectedChapterIds.includes(chapter.id)
    }));
    setChapters(updatedChapters);

    const selectedTitles = updatedChapters
      .filter(c => c.selected)
      .map(c => `• ${c.title}`)
      .join('\n');

    addMessage(`✅ **선택된 챕터 (${selectedChapterIds.length}개):**\n${selectedTitles}`, "assistant", "user-selection");
    
    setClipperState("processing");
    addMessage("🎬 **5단계: 클립 처리**", "assistant", "processing");
    addMessage("선택하신 챕터들을 처리하고 있습니다...", "assistant", "processing");
    
    // 처리 시뮬레이션
    setTimeout(() => {
      addMessage("🎉 **처리 완료!**\n\n📁 **출력 디렉토리:** `./youtube-clips/20250103_143022/`\n\n**생성된 파일:**", "assistant", "result");
      
      const resultFiles = updatedChapters
        .filter(c => c.selected)
        .map(chapter => {
          const files = [
            `🎬 ${chapter.title.replace(/[^a-zA-Z0-9가-힣\s]/g, '').replace(/\s+/g, '_')}_clip.mp4 (24 MB)`
          ];
          
          if (processingOptions.bilingual) {
            files.push(`📄 ${chapter.title.replace(/[^a-zA-Z0-9가-힣\s]/g, '').replace(/\s+/g, '_')}_bilingual.srt (3.2 KB)`);
          }
          
          if (processingOptions.burnSubtitles) {
            files.push(`🎞️ ${chapter.title.replace(/[^a-zA-Z0-9가-힣\s]/g, '').replace(/\s+/g, '_')}_with_subtitles.mp4 (26 MB)`);
          }
          
          if (processingOptions.generateSummary) {
            files.push(`📝 ${chapter.title.replace(/[^a-zA-Z0-9가-힣\s]/g, '').replace(/\s+/g, '_')}_summary.md (1.8 KB)`);
          }
          
          return `\n**${chapter.title}:**\n${files.map(f => `  ${f}`).join('\n')}`;
        })
        .join('\n');

      addMessage(resultFiles, "assistant", "result");
      
      setClipperState("completed");
      addMessage("다른 영상을 처리하시거나 추가 질문이 있으시면 언제든 말씀해주세요! 🚀", "assistant");
    }, 4000);
  };

  const handleGeneralQuery = async (input: string) => {
    // 일반적인 질문 처리
    addMessage(`"${input}"에 대한 도움을 드리겠습니다. 구체적으로 어떤 부분을 도와드릴까요?`, "assistant");
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const toggleProcessingOption = (option: keyof ProcessingOptions) => {
    setProcessingOptions(prev => ({
      ...prev,
      [option]: !prev[option]
    }));
  };

  return (
    <div className="h-[80vh] flex flex-col border border-gold/20 rounded-xl bg-ink-light">
      {/* 헤더 */}
      <div className="flex items-center justify-between p-4 border-b border-gold/20">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToSkills}
            className="p-2 hover:bg-gold/10 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} className="text-parchment/60" />
          </button>
          <div>
            <h3 className="font-body font-semibold text-parchment">
              {selectedSkill.name}
            </h3>
            <p className="text-sm text-parchment/60 font-body">
              AI 기반 스마트 영상 클리핑
            </p>
          </div>
        </div>
        
        {/* 처리 옵션 (user-selection 상태일 때만 표시) */}
        {clipperState === "user-selection" && (
          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={processingOptions.bilingual}
                onChange={() => toggleProcessingOption('bilingual')}
                className="w-4 h-4"
              />
              <span className="text-parchment">이중언어 자막</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={processingOptions.burnSubtitles}
                onChange={() => toggleProcessingOption('burnSubtitles')}
                className="w-4 h-4"
              />
              <span className="text-parchment">자막 하드코딩</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={processingOptions.generateSummary}
                onChange={() => toggleProcessingOption('generateSummary')}
                className="w-4 h-4"
              />
              <span className="text-parchment">요약 문안</span>
            </label>
          </div>
        )}
      </div>

      {/* 메시지 영역 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${message.role === "user" ? "justify-end" : ""}`}
          >
            {message.role !== "user" && (
              <div className="w-8 h-8 rounded-full bg-gold/20 flex items-center justify-center flex-shrink-0">
                <Bot size={16} className="text-gold" />
              </div>
            )}
            
            <div
              className={`max-w-[70%] rounded-xl p-4 ${
                message.role === "user"
                  ? "bg-blue-600/20 text-blue-100"
                  : message.type === "progress"
                  ? "bg-green-600/20 text-green-100 border border-green-500/30"
                  : message.type === "chapter-analysis"
                  ? "bg-purple-600/20 text-purple-100 border border-purple-500/30"
                  : message.type === "user-selection"
                  ? "bg-yellow-600/20 text-yellow-100 border border-yellow-500/30"
                  : message.type === "processing"
                  ? "bg-blue-600/20 text-blue-100 border border-blue-500/30"
                  : message.type === "result"
                  ? "bg-green-600/20 text-green-100 border border-green-500/30"
                  : "bg-ink-dark text-parchment"
              }`}
            >
              <div className="prose prose-sm text-current font-body">
                {message.content.split('\n').map((line, i) => (
                  <p key={i} className="mb-2 last:mb-0">
                    {line}
                  </p>
                ))}
              </div>
              
              {message.role === "assistant" && (
                <div className="flex gap-2 mt-3 pt-3 border-t border-current/20">
                  <button
                    onClick={() => copyToClipboard(message.content)}
                    className="p-1 text-current/40 hover:text-current transition-colors"
                    title="복사"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              )}
            </div>

            {message.role === "user" && (
              <div className="w-8 h-8 rounded-full bg-blue-600/20 flex items-center justify-center flex-shrink-0">
                <User size={16} className="text-blue-400" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-gold/20 flex items-center justify-center">
              <Bot size={16} className="text-gold" />
            </div>
            <div className="bg-ink-dark rounded-xl p-4">
              <div className="flex items-center gap-2 text-parchment/60">
                <Loader size={16} className="animate-spin" />
                <span className="text-sm font-body">처리 중...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 입력 영역 */}
      <div className="p-4 border-t border-gold/20">
        <div className="flex gap-3">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
            placeholder={
              clipperState === "initial" ? "YouTube URL을 입력하세요..." :
              clipperState === "user-selection" ? "챕터 번호를 선택하세요 (예: 1,3,5 또는 all)..." :
              "질문이나 명령을 입력하세요..."
            }
            className="flex-1 px-4 py-2 bg-ink-dark border border-gold/30 focus:border-gold/60 rounded-lg text-parchment font-body text-sm outline-none"
            disabled={isLoading}
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isLoading}
            className="px-4 py-2 bg-gold hover:bg-gold-light disabled:opacity-50 text-ink font-body font-semibold rounded-lg transition-colors"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}