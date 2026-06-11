// ============================================
// 生物化学学习平台 - 核心应用逻辑
// ============================================

// ============ 存储管理 ============
const Storage = {
    get(key, defaultVal = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultVal;
        } catch {
            return defaultVal;
        }
    },
    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            console.error('存储失败:', e);
        }
    },
    remove(key) {
        localStorage.removeItem(key);
    }
};

// ============ 用户系统 ============
const UserSystem = {
    currentUser: null,

    init() {
        const saved = Storage.get('currentUser');
        if (saved) {
            this.currentUser = saved;
        }
    },

    register(username, password, email) {
        const users = Storage.get('users', []);
        if (users.find(u => u.username === username)) {
            return { success: false, message: '用户名已存在' };
        }
        const newUser = {
            username,
            password: this.hashPassword(password),
            email,
            createdAt: Date.now(),
            level: 1,
            xp: 0,
            totalXp: 0,
            achievements: [],
            progress: {},
            quizHistory: [],
            flashcardHistory: [],
            streak: 0,
            lastStudyDate: null,
            studyMinutes: 0
        };
        users.push(newUser);
        Storage.set('users', users);
        return { success: true, message: '注册成功！', user: newUser };
    },

    login(username, password) {
        const users = Storage.get('users', []);
        const user = users.find(u => u.username === username && u.password === this.hashPassword(password));
        if (!user) {
            return { success: false, message: '用户名或密码错误' };
        }
        this.currentUser = user;
        Storage.set('currentUser', user);
        return { success: true, message: '登录成功！', user };
    },

    logout() {
        this.currentUser = null;
        Storage.remove('currentUser');
    },

    getCurrentUser() {
        // 优先用内存中的 currentUser（由 init 从 localStorage 恢复）
        if (this.currentUser) return this.currentUser;
        // 如果内存中没有，尝试从 localStorage 直接恢复（防止跨脚本调用）
        const saved = Storage.get('currentUser');
        if (saved) {
            this.currentUser = saved;
            return saved;
        }
        return null;
    },

    updateUser(data) {
        const users = Storage.get('users', []);
        const idx = users.findIndex(u => u.username === this.currentUser.username);
        if (idx !== -1) {
            users[idx] = { ...users[idx], ...data };
            Storage.set('users', users);
            this.currentUser = users[idx];
            Storage.set('currentUser', users[idx]);
        }
    },

    hashPassword(pwd) {
        // 简单哈希，实际生产环境应使用 bcrypt 等
        let hash = 0;
        for (let i = 0; i < pwd.length; i++) {
            const char = pwd.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(36);
    },

    requireLogin(callback) {
        if (!this.currentUser) {
            showToast('请先登录', 'warning');
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 1000);
            return false;
        }
        if (callback) callback();
        return true;
    }
};

// ============ 进度追踪 ============
const ProgressTracker = {
    // 标记知识点已学习
    markKnowledgeCompleted(chapterId, knowledgeId) {
        const user = UserSystem.getCurrentUser();
        if (!user) return;

        const key = `${chapterId}_${knowledgeId}`;
        if (!user.progress[key]) {
            user.progress[key] = {
                completed: true,
                completedAt: Date.now(),
                reviewCount: 1
            };
        } else {
            user.progress[key].reviewCount += 1;
            user.progress[key].lastReview = Date.now();
        }

        this.checkAndAwardAchievements(user);
        UserSystem.updateUser({ progress: user.progress });
    },

    // 记录练习得分
    recordQuiz(type, chapterId, score, totalQuestions) {
        const user = UserSystem.getCurrentUser();
        if (!user) return;

        const record = {
            type,
            chapterId,
            score,
            total: totalQuestions,
            percentage: Math.round((score / totalQuestions) * 100),
            timestamp: Date.now()
        };

        if (!user.quizHistory) user.quizHistory = [];
        user.quizHistory.push(record);

        // 获得 XP
        const xp = Math.round((score / totalQuestions) * 20);
        user.xp += xp;
        user.totalXp += xp;

        this.checkAndAwardAchievements(user);
        UserSystem.updateUser({ quizHistory: user.quizHistory, xp: user.xp, totalXp: user.totalXp });
        return xp;
    },

    // 更新学习天数
    updateStudyStreak() {
        const user = UserSystem.getCurrentUser();
        if (!user) return;

        const today = new Date().toDateString();
        if (user.lastStudyDate === today) return;

        const yesterday = new Date(Date.now() - 86400000).toDateString();
        if (user.lastStudyDate === yesterday) {
            user.streak += 1;
        } else {
            user.streak = 1;
        }
        user.lastStudyDate = today;
        user.studyMinutes += 5;

        this.checkAndAwardAchievements(user);
        UserSystem.updateUser({ streak: user.streak, lastStudyDate: user.lastStudyDate, studyMinutes: user.studyMinutes });
    },

    // 获取章节学习进度
    getChapterProgress(chapterId) {
        const user = UserSystem.getCurrentUser();
        if (!user) return { completed: 0, total: 0, percentage: 0 };

        const chapter = BIOCHEM_DATA.chapters.find(c => c.id === chapterId);
        if (!chapter) return { completed: 0, total: 0, percentage: 0 };

        const total = chapter.knowledge.length;
        let completed = 0;
        chapter.knowledge.forEach(kn => {
            if (user.progress[`${chapterId}_${kn.id}`]?.completed) completed++;
        });

        return {
            completed,
            total,
            percentage: total === 0 ? 0 : Math.round((completed / total) * 100)
        };
    },

    // 获取总体学习统计
    getOverallStats() {
        const user = UserSystem.getCurrentUser();
        if (!user) return null;

        const totalKnowledge = BIOCHEM_DATA.chapters.reduce((sum, c) => sum + c.knowledge.length, 0);
        const completedKnowledge = Object.values(user.progress || {}).filter(p => p.completed).length;
        const totalQuizzes = user.quizHistory?.length || 0;
        const avgScore = totalQuizzes > 0
            ? Math.round(user.quizHistory.reduce((sum, q) => sum + q.percentage, 0) / totalQuizzes)
            : 0;

        return {
            totalKnowledge,
            completedKnowledge,
            percentage: totalKnowledge === 0 ? 0 : Math.round((completedKnowledge / totalKnowledge) * 100),
            totalQuizzes,
            avgScore,
            xp: user.xp,
            totalXp: user.totalXp,
            level: user.level,
            streak: user.streak,
            studyMinutes: user.studyMinutes
        };
    },

    // ============ 成就系统 ============
    ACHIEVEMENTS: [
        { id: 'first_login', name: '初入生化', description: '首次登录系统', icon: '🎉', xp: 10 },
        { id: 'first_knowledge', name: '学习起步', description: '完成第一个知识点学习', icon: '📖', xp: 15 },
        { id: 'first_quiz', name: '小试牛刀', description: '完成第一次练习', icon: '✍️', xp: 15 },
        { id: 'chapter_complete', name: '章有所成', description: '完整学习一章内容', icon: '📚', xp: 50 },
        { id: 'streak_3', name: '三连胜', description: '连续学习3天', icon: '🔥', xp: 30 },
        { id: 'streak_7', name: '一周坚持', description: '连续学习7天', icon: '💪', xp: 70 },
        { id: 'streak_30', name: '月度学霸', description: '连续学习30天', icon: '🏆', xp: 200 },
        { id: 'score_100', name: '完美答卷', description: '任意练习获得满分', icon: '💯', xp: 50 },
        { id: 'score_80', name: '优秀学员', description: '3次练习得分80%以上', icon: '⭐', xp: 30 },
        { id: 'quiz_10', name: '勤学苦练', description: '完成10次练习', icon: '📝', xp: 40 },
        { id: 'quiz_50', name: '刷题达人', description: '完成50次练习', icon: '🎯', xp: 100 },
        { id: 'knowledge_10', name: '求知若渴', description: '学习10个知识点', icon: '🔬', xp: 40 },
        { id: 'knowledge_half', name: '半程勇士', description: '完成一半知识点学习', icon: '⚡', xp: 80 },
        { id: 'knowledge_all', name: '生化大师', description: '完成所有知识点学习', icon: '👑', xp: 300 },
        { id: 'xp_100', name: '小有成就', description: '累计获得100经验值', icon: '🌟', xp: 20 },
        { id: 'xp_500', name: '经验丰富', description: '累计获得500经验值', icon: '✨', xp: 50 },
        { id: 'xp_1000', name: '经验大师', description: '累计获得1000经验值', icon: '🌈', xp: 100 },
        { id: 'community_post', name: '社区新星', description: '发布第一条帖子', icon: '💬', xp: 15 },
        { id: 'community_helper', name: '热心助人', description: '获得5条点赞', icon: '👍', xp: 30 }
    ],

    checkAndAwardAchievements(user) {
        const unlocked = user.achievements || [];
        const newUnlocks = [];

        const unlockAchievement = (id) => {
            if (!unlocked.find(a => a.id === id)) {
                const ach = this.ACHIEVEMENTS.find(a => a.id === id);
                if (ach) {
                    unlocked.push({ ...ach, unlockedAt: Date.now() });
                    user.xp += ach.xp;
                    user.totalXp += ach.xp;
                    newUnlocks.push(ach);
                }
            }
        };

        // 首次登录
        unlockAchievement('first_login');

        // 知识点学习相关
        const completedCount = Object.values(user.progress || {}).filter(p => p.completed).length;
        if (completedCount >= 1) unlockAchievement('first_knowledge');
        if (completedCount >= 10) unlockAchievement('knowledge_10');

        // 章节完成
        BIOCHEM_DATA.chapters.forEach(ch => {
            const chCompleted = ch.knowledge.every(k => user.progress[`${ch.id}_${k.id}`]?.completed);
            if (chCompleted) unlockAchievement('chapter_complete');
        });

        // 完成比例
        const totalKnowledge = BIOCHEM_DATA.chapters.reduce((sum, c) => sum + c.knowledge.length, 0);
        if (completedCount >= totalKnowledge / 2) unlockAchievement('knowledge_half');
        if (completedCount >= totalKnowledge) unlockAchievement('knowledge_all');

        // 连续学习
        if (user.streak >= 3) unlockAchievement('streak_3');
        if (user.streak >= 7) unlockAchievement('streak_7');
        if (user.streak >= 30) unlockAchievement('streak_30');

        // 练习相关
        const quizzes = user.quizHistory || [];
        if (quizzes.length >= 1) unlockAchievement('first_quiz');
        if (quizzes.length >= 10) unlockAchievement('quiz_10');
        if (quizzes.length >= 50) unlockAchievement('quiz_50');
        if (quizzes.some(q => q.percentage === 100)) unlockAchievement('score_100');
        if (quizzes.filter(q => q.percentage >= 80).length >= 3) unlockAchievement('score_80');

        // XP 里程碑
        if (user.totalXp >= 100) unlockAchievement('xp_100');
        if (user.totalXp >= 500) unlockAchievement('xp_500');
        if (user.totalXp >= 1000) unlockAchievement('xp_1000');

        // 等级计算
        const newLevel = Math.floor(user.totalXp / 100) + 1;
        if (newLevel > user.level) {
            user.level = newLevel;
        }

        user.achievements = unlocked;
        UserSystem.updateUser(user);

        if (newUnlocks.length > 0) {
            newUnlocks.forEach((ach, idx) => {
                setTimeout(() => {
                    showToast(`🏆 解锁成就：${ach.name}`, 'success');
                }, idx * 1500);
            });
        }

        return newUnlocks;
    },

    getAchievements() {
        const user = UserSystem.getCurrentUser();
        if (!user) return this.ACHIEVEMENTS.map(a => ({ ...a, unlocked: false }));

        const unlocked = user.achievements || [];
        return this.ACHIEVEMENTS.map(a => ({
            ...a,
            unlocked: !!unlocked.find(u => u.id === a.id),
            unlockedAt: unlocked.find(u => u.id === a.id)?.unlockedAt
        }));
    },

    // ============ 个性化推荐 ============
    getRecommendations() {
        const user = UserSystem.getCurrentUser();
        if (!user) return [];

        const recommendations = [];
        const progress = user.progress || {};
        const quizHistory = user.quizHistory || [];

        // 1. 推荐未学习的知识点（优先未学习的章节）
        for (const chapter of BIOCHEM_DATA.chapters) {
            for (const knowledge of chapter.knowledge) {
                const key = `${chapter.id}_${knowledge.id}`;
                if (!progress[key]?.completed) {
                    recommendations.push({
                        type: 'learn',
                        priority: 1,
                        title: `学习新知识点: ${knowledge.title}`,
                        subtitle: chapter.title,
                        icon: '📖',
                        chapterId: chapter.id,
                        knowledgeId: knowledge.id,
                        reason: '推荐优先学习未掌握的内容'
                    });
                    if (recommendations.filter(r => r.type === 'learn').length >= 3) break;
                }
            }
            if (recommendations.filter(r => r.type === 'learn').length >= 3) break;
        }

        // 2. 推荐复习（间隔重复 - 基于艾宾浩斯遗忘曲线简化版）
        const now = Date.now();
        for (const chapter of BIOCHEM_DATA.chapters) {
            for (const knowledge of chapter.knowledge) {
                const key = `${chapter.id}_${knowledge.id}`;
                const p = progress[key];
                if (p?.completed && p.reviewCount < 3) {
                    const daysSinceCompleted = (now - (p.lastReview || p.completedAt)) / 86400000;
                    const shouldReview = (p.reviewCount === 1 && daysSinceCompleted >= 1) ||
                                        (p.reviewCount === 2 && daysSinceCompleted >= 3) ||
                                        (p.reviewCount === 0 && daysSinceCompleted >= 7);
                    if (shouldReview) {
                        recommendations.push({
                            type: 'review',
                            priority: 2,
                            title: `复习巩固: ${knowledge.title}`,
                            subtitle: `${chapter.title} · 已学习 ${p.reviewCount} 次`,
                            icon: '🔄',
                            chapterId: chapter.id,
                            knowledgeId: knowledge.id,
                            reason: '间隔复习能加深记忆'
                        });
                        if (recommendations.filter(r => r.type === 'review').length >= 2) break;
                    }
                }
            }
            if (recommendations.filter(r => r.type === 'review').length >= 2) break;
        }

        // 3. 推荐练习薄弱的章节
        const chapterScores = {};
        quizHistory.forEach(q => {
            if (!chapterScores[q.chapterId]) chapterScores[q.chapterId] = { total: 0, count: 0 };
            chapterScores[q.chapterId].total += q.percentage;
            chapterScores[q.chapterId].count += 1;
        });

        Object.entries(chapterScores)
            .map(([id, s]) => ({ id, avg: s.total / s.count }))
            .filter(s => s.avg < 70)
            .sort((a, b) => a.avg - b.avg)
            .slice(0, 2)
            .forEach(s => {
                const chapter = BIOCHEM_DATA.chapters.find(c => c.id === s.id);
                if (chapter) {
                    recommendations.push({
                        type: 'practice',
                        priority: 3,
                        title: `加强练习: ${chapter.title}`,
                        subtitle: `当前平均正确率 ${Math.round(s.avg)}%`,
                        icon: '💪',
                        chapterId: chapter.id,
                        reason: '薄弱章节需要多加练习巩固'
                    });
                }
            });

        // 4. 如果没有推荐（新用户），给个默认推荐
        if (recommendations.length === 0) {
            recommendations.push({
                type: 'getting-started',
                priority: 0,
                title: '开启你的生物化学之旅',
                subtitle: '从第一章开始学习基础概念',
                icon: '🚀',
                chapterId: 'chapter-1',
                reason: '建议从基础概念开始系统学习'
            });
        }

        return recommendations.sort((a, b) => a.priority - b.priority).slice(0, 5);
    }
};

// ============ 社区系统 ============
const CommunitySystem = {
    getPosts() {
        return Storage.get('posts', []);
    },

    addPost(title, content, tags = []) {
        const user = UserSystem.getCurrentUser();
        if (!user) return { success: false, message: '请先登录' };

        const posts = this.getPosts();
        const newPost = {
            id: 'post_' + Date.now(),
            author: user.username,
            title,
            content,
            tags: tags.filter(t => t.trim()),
            likes: [],
            comments: [],
            createdAt: Date.now()
        };
        posts.unshift(newPost);
        Storage.set('posts', posts);

        // 检查成就
        const userData = UserSystem.getCurrentUser();
        ProgressTracker.checkAndAwardAchievements(userData);

        return { success: true, post: newPost };
    },

    toggleLike(postId) {
        const user = UserSystem.getCurrentUser();
        if (!user) return { success: false };

        const posts = this.getPosts();
        const post = posts.find(p => p.id === postId);
        if (!post) return { success: false };

        const likeIdx = post.likes.indexOf(user.username);
        if (likeIdx === -1) {
            post.likes.push(user.username);
        } else {
            post.likes.splice(likeIdx, 1);
        }

        Storage.set('posts', posts);

        // 检查获得点赞数的成就
        if (post.author === user.username || post.likes.length >= 5) {
            // 检查作者是否累计获得5条点赞
            const author = user.username;
            const totalLikes = posts.filter(p => p.author === author)
                .reduce((sum, p) => sum + p.likes.length, 0);
            if (totalLikes >= 5) {
                const userData = UserSystem.getCurrentUser();
                if (!userData.achievements?.find(a => a.id === 'community_helper')) {
                    ProgressTracker.checkAndAwardAchievements(userData);
                }
            }
        }

        return { success: true, liked: likeIdx === -1, likesCount: post.likes.length };
    },

    addComment(postId, comment) {
        const user = UserSystem.getCurrentUser();
        if (!user) return { success: false };

        const posts = this.getPosts();
        const post = posts.find(p => p.id === postId);
        if (!post) return { success: false };

        post.comments.push({
            id: 'comment_' + Date.now(),
            author: user.username,
            content: comment,
            createdAt: Date.now(),
            likes: []
        });

        Storage.set('posts', posts);
        return { success: true, comment: post.comments[post.comments.length - 1] };
    },

    deletePost(postId) {
        const user = UserSystem.getCurrentUser();
        if (!user) return { success: false };

        let posts = this.getPosts();
        posts = posts.filter(p => !(p.id === postId && p.author === user.username));
        Storage.set('posts', posts);
        return { success: true };
    }
};

// ============ Toast 提示 ============
function showToast(message, type = 'info') {
    // 移除旧 toast
    const oldToast = document.querySelector('.app-toast');
    if (oldToast) oldToast.remove();

    const toast = document.createElement('div');
    toast.className = `app-toast toast ${type}`;
    toast.innerHTML = `<div class="toast-title">${type === 'success' ? '✓ 成功' : type === 'error' ? '✗ 错误' : type === 'warning' ? '⚠ 注意' : 'ℹ 提示'}</div><div class="toast-message">${message}</div>`;

    document.body.appendChild(toast);

    // 显示动画
    setTimeout(() => toast.classList.add('show'), 10);

    // 自动消失
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 3500);
}

// ============ 页面导航辅助 ============
function updateNavActive() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-links a').forEach(link => {
        const href = link.getAttribute('href');
        if (href === currentPage) {
            link.classList.add('active');
        }
    });
}

function renderUserNav() {
    const navUserContainer = document.querySelector('.nav-user');
    if (!navUserContainer) return;

    const user = UserSystem.getCurrentUser();
    if (user) {
        const initial = user.username.charAt(0).toUpperCase();
        navUserContainer.innerHTML = `
            <a href="dashboard.html" style="text-decoration: none; color: inherit;">
                <div class="user-avatar">${initial}</div>
            </a>
            <button class="btn-logout" onclick="doLogout()">退出</button>
        `;
    } else {
        navUserContainer.innerHTML = `
            <a href="login.html" class="btn btn-primary" style="padding: 8px 16px; font-size: 0.9rem;">登录</a>
            <a href="register.html" class="btn btn-secondary" style="padding: 8px 16px; font-size: 0.9rem;">注册</a>
        `;
    }
}

function doLogout() {
    UserSystem.logout();
    showToast('已退出登录', 'success');
    setTimeout(() => {
        window.location.href = 'index.html';
    }, 1000);
}

// ============ 日期格式化 ============
function formatDate(ts) {
    const date = new Date(ts);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`;

    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// ============ 题目查询（quiz.html 使用） ============
function getAllQuestions(type) {
    // 从 BIOCHEM_DATA 中提取所有题目
    // type: 'term' | 'blank' | 'memory' | 'essay'
    const questions = [];
    
    // BIOCHEM_DATA 和 EXAM_QUESTIONS 定义在 data.js 中，全局可用
    const data = window.BIOCHEM_DATA || BIOCHEM_DATA;
    if (!data || !data.chapters) return questions;
    
    data.chapters.forEach(chapter => {
        (chapter.knowledge || []).forEach(k => {
            const base = {
                chapterId: chapter.id,
                chapterTitle: chapter.title,
                knowledgeId: k.id,
                knowledgeTitle: k.title
            };
            
            if (type === 'term') {
                (k.terms || []).forEach(t => {
                    questions.push({ ...base, term: t.term, def: t.def });
                });
            } else if (type === 'blank') {
                (k.blanks || []).forEach(b => {
                    questions.push({ ...base, text: b.text, answers: b.answers });
                });
            } else if (type === 'memory') {
                (k.memory || []).forEach(m => {
                    questions.push({ ...base, q: m.q, a: m.a });
                });
            } else if (type === 'essay') {
                (k.essay || []).forEach(e => {
                    questions.push({ ...base, q: e.q, a: e.a });
                });
            }
        });
    });
    
    return questions;
}

// ============ 初始化（所有页面通用） ============
document.addEventListener('DOMContentLoaded', () => {
    UserSystem.init();
    renderUserNav();
    updateNavActive();
});
