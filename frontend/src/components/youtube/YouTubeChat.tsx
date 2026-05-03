import { useState, useRef, useEffect } from "react";
import { Send, ArrowLeft, Bot, User, Copy, Download, Loader } from "lucide-react";
import { YouTubeSkill } from "../../pages/YouTubeStudioSimple";
import { youtubeApi, ChannelContext as APIChannelContext } from "../../api/youtube";

// 로컬 ChannelContext 타입 정의
interface ChannelContext {
  niche: string;
  size: "new" | "growing" | "established" | "authority";
  goal: "growth" | "monetization" | "authority" | "engagement";
  url?: string;
}

interface Props {
  selectedSkill: YouTubeSkill;
  onBackToSkills: () => void;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}


export function YouTubeChat({ selectedSkill, onBackToSkills }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [channelContext, setChannelContext] = useState<ChannelContext | null>(null);
  const [showContextForm, setShowContextForm] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleContextSubmit = (context: ChannelContext) => {
    setChannelContext(context);
    setShowContextForm(false);
    
    // 초기 메시지 추가
    const initialMessage: Message = {
      id: Date.now().toString(),
      role: "assistant",
      content: `안녕하세요! ${selectedSkill.name} 전문가입니다. 

**채널 정보 확인:**
- 니치: ${context.niche}
- 규모: ${getSizeLabel(context.size)}
- 목표: ${getGoalLabel(context.goal)}
${context.url ? `- URL: ${context.url}` : ""}

이제 ${selectedSkill.description}를 시작하겠습니다. 어떤 부분부터 도움을 드릴까요?`,
      timestamp: new Date()
    };

    setMessages([initialMessage]);
  };

  const getSizeLabel = (size: string) => {
    switch (size) {
      case "new": return "신규 (1천 미만)";
      case "growing": return "성장 (1천~1만)";
      case "established": return "안정 (1만~10만)";
      case "authority": return "권위 (10만+)";
      default: return size;
    }
  };

  const getGoalLabel = (goal: string) => {
    switch (goal) {
      case "growth": return "구독자 성장";
      case "monetization": return "수익화";
      case "authority": return "브랜드 권위";
      case "engagement": return "오디언스 참여";
      default: return goal;
    }
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
      // 실제 백엔드 API 호출
      const response = await youtubeApi.analyzeSkill({
        skillId: selectedSkill.id,
        query: userMessage.content,
        channelContext: channelContext! as APIChannelContext
      });

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: response.analysis,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error("YouTube 스킬 처리 오류:", error);
      
      // 에러 발생 시 폴백 응답
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `죄송합니다. ${selectedSkill.name} 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.\n\n오류: ${error instanceof Error ? error.message : "알 수 없는 오류"}`,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };


  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (showContextForm) {
    return <ChannelContextForm onSubmit={handleContextSubmit} onBack={onBackToSkills} />;
  }

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
              {channelContext?.niche} • {getSizeLabel(channelContext?.size || "new")}
            </p>
          </div>
        </div>
      </div>

      {/* 메시지 영역 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${message.role === "user" ? "justify-end" : ""}`}
          >
            {message.role === "assistant" && (
              <div className="w-8 h-8 rounded-full bg-gold/20 flex items-center justify-center flex-shrink-0">
                <Bot size={16} className="text-gold" />
              </div>
            )}
            
            <div
              className={`max-w-[70%] rounded-xl p-4 ${
                message.role === "user"
                  ? "bg-blue-600/20 text-blue-100"
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
                <div className="flex gap-2 mt-3 pt-3 border-t border-gold/20">
                  <button
                    onClick={() => copyToClipboard(message.content)}
                    className="p-1 text-parchment/40 hover:text-parchment transition-colors"
                    title="복사"
                  >
                    <Copy size={14} />
                  </button>
                  <button
                    className="p-1 text-parchment/40 hover:text-parchment transition-colors"
                    title="다운로드"
                  >
                    <Download size={14} />
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
                <span className="text-sm font-body">분석 중...</span>
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
            placeholder={`${selectedSkill.name}에 대해 질문하세요...`}
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

interface ChannelContextFormProps {
  onSubmit: (context: ChannelContext) => void;
  onBack: () => void;
}

function ChannelContextForm({ onSubmit, onBack }: ChannelContextFormProps) {
  const [niche, setNiche] = useState("");
  const [size, setSize] = useState<ChannelContext["size"]>("new");
  const [goal, setGoal] = useState<ChannelContext["goal"]>("growth");
  const [url, setUrl] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ niche, size, goal, url: url || undefined });
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="border border-gold/20 rounded-xl p-6 bg-ink-light">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={onBack}
            className="p-2 hover:bg-gold/10 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} className="text-parchment/60" />
          </button>
          <div>
            <h3 className="font-body font-bold text-xl text-parchment">
              채널 정보 입력
            </h3>
            <p className="text-sm text-parchment/60 font-body">
              맞춤형 조언을 위해 채널 정보를 알려주세요
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-parchment font-body font-semibold mb-2">
              채널 니치/주제 *
            </label>
            <input
              type="text"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              placeholder="예: 히브리어 성경 3D 애니메이션"
              className="w-full px-4 py-3 bg-ink-dark border border-gold/30 focus:border-gold/60 rounded-lg text-parchment font-body outline-none"
              required
            />
            <p className="text-xs text-parchment/50 font-body mt-1">
              구체적으로 작성하세요 (단순히 "종교" X)
            </p>
          </div>

          <div>
            <label className="block text-parchment font-body font-semibold mb-2">
              채널 크기 *
            </label>
            <select
              value={size}
              onChange={(e) => setSize(e.target.value as ChannelContext["size"])}
              className="w-full px-4 py-3 bg-ink-dark border border-gold/30 focus:border-gold/60 rounded-lg text-parchment font-body outline-none"
            >
              <option value="new">신규 (1천 구독자 미만)</option>
              <option value="growing">성장 (1천~1만 구독자)</option>
              <option value="established">안정 (1만~10만 구독자)</option>
              <option value="authority">권위 (10만 구독자 이상)</option>
            </select>
          </div>

          <div>
            <label className="block text-parchment font-body font-semibold mb-2">
              주요 목표 *
            </label>
            <select
              value={goal}
              onChange={(e) => setGoal(e.target.value as ChannelContext["goal"])}
              className="w-full px-4 py-3 bg-ink-dark border border-gold/30 focus:border-gold/60 rounded-lg text-parchment font-body outline-none"
            >
              <option value="growth">구독자 성장</option>
              <option value="monetization">수익화</option>
              <option value="authority">브랜드 권위</option>
              <option value="engagement">오디언스 참여</option>
            </select>
          </div>

          <div>
            <label className="block text-parchment font-body font-semibold mb-2">
              채널 URL (선택사항)
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://youtube.com/@your-channel"
              className="w-full px-4 py-3 bg-ink-dark border border-gold/30 focus:border-gold/60 rounded-lg text-parchment font-body outline-none"
            />
            <p className="text-xs text-parchment/50 font-body mt-1">
              감사, 분석, 경쟁자 분석 시 필요합니다
            </p>
          </div>

          <button
            type="submit"
            className="w-full bg-gold hover:bg-gold-light text-ink font-body font-semibold py-3 rounded-lg transition-colors"
          >
            YouTube 전문가와 대화 시작
          </button>
        </form>
      </div>
    </div>
  );
}