document.addEventListener('DOMContentLoaded', () => {
    // 导航栏滚动效果
    window.addEventListener('scroll', () => {
        const navbar = document.querySelector('.navbar');
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // 产品卡片动画
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.product-card').forEach(card => {
        observer.observe(card);
    });

    // 模态框功能
    const modal = document.getElementById('productModal');
    const modalContent = document.querySelector('.modal-content');
    const closeBtn = document.querySelector('.close');

    document.querySelectorAll('.product-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (!e.target.closest('.btn')) {
                const product = {
                    ecs: {
                        name: '云服务器 ECS',
                        desc: '弹性计算服务，提供安全可靠的弹性计算能力',
                        features: ['弹性伸缩', '安全可靠', '简单高效', '按量付费'],
                        price: '¥0.01/小时起'
                    },
                    rds: {
                        name: '云数据库 RDS',
                        desc: '稳定可靠、可弹性伸缩的在线数据库服务',
                        features: ['自动备份', '读写分离', '高可用架构', '性能监控'],
                        price: '¥0.01/小时起'
                    },
                    oss: {
                        name: '对象存储 OSS',
                        desc: '海量、安全、低成本、高可靠的云存储服务',
                        features: ['海量存储', '数据安全', '全球加速', '生命周期管理'],
                        price: '¥0.12/GB/月起'
                    },
                    slb: {
                        name: '负载均衡 SLB',
                        desc: '对多台云服务器进行流量分发的负载均衡服务',
                        features: ['流量分发', '健康检查', '会话保持', '弹性扩展'],
                        price: '¥0.01/小时起'
                    },
                    cdn: {
                        name: '内容分发网络 CDN',
                        desc: '将源站内容分发至全国所有节点，缩短用户查看内容的延迟',
                        features: ['全球加速', '智能调度', '安全防护', '实时监控'],
                        price: '¥0.21/GB起'
                    },
                    vpc: {
                        name: '专有网络 VPC',
                        desc: '隔离的网络环境，提供自定义网络配置能力',
                        features: ['网络隔离', '自定义网段', '安全组', 'VPN连接'],
                        price: '免费'
                    }
                };

                const productId = card.dataset.product;
                const p = product[productId];
                
                modalContent.innerHTML = `
                    <span class="close">&times;</span>
                    <h2>${p.name}</h2>
                    <p class="modal-desc">${p.desc}</p>
                    <div class="modal-features">
                        <h3>核心特性</h3>
                        <ul>
                            ${p.features.map(f => `<li>${f}</li>`).join('')}
                        </ul>
                    </div>
                    <div class="modal-price">
                        <h3>价格</h3>
                        <p>${p.price}</p>
                    </div>
                    <a href="https://www.aliyun.com/" class="btn" target="_blank">立即购买</a>
                `;
                
                modal.style.display = 'block';
            }
        });
    });

    closeBtn.onclick = () => {
        modal.style.display = 'none';
    };

    window.onclick = (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    };
});
