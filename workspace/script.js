document.addEventListener('DOMContentLoaded', function() {
    // 导航栏滚动效果
    const navbar = document.querySelector('.navbar');
    window.addEventListener('scroll', function() {
        if (window.scrollY > 50) {
            navbar.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
            navbar.style.background = 'rgba(255, 255, 255, 0.98)';
        } else {
            navbar.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
            navbar.style.background = 'white';
        }
    });

    // 导航链接点击平滑滚动
    const navLinks = document.querySelectorAll('.nav-links a');
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                // 移除所有激活状态
                navLinks.forEach(l => l.classList.remove('active'));
                // 添加当前激活状态
                this.classList.add('active');
                // 平滑滚动
                window.scrollTo({
                    top: targetElement.offsetTop - 80,
                    behavior: 'smooth'
                });
            }
        });
    });

    // 表单提交处理
    const inquiryForm = document.getElementById('inquiryForm');
    if (inquiryForm) {
        inquiryForm.addEventListener('submit', function(e) {
            e.preventDefault();
            alert('感谢您的咨询！我们会尽快与您联系。');
            inquiryForm.reset();
        });
    }

    // 滚动时更新导航激活状态
    window.addEventListener('scroll', function() {
        const sections = document.querySelectorAll('section');
        const scrollPos = window.scrollY + 80;
        
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.offsetHeight;
            const sectionId = section.getAttribute('id');
            
            if (scrollPos >= sectionTop && scrollPos < sectionTop + sectionHeight) {
                navLinks.forEach(link => {
                    link.classList.remove('active');
                    if (link.getAttribute('href') === `#${sectionId}`) {
                        link.classList.add('active');
                    }
                });
            }
        });
    });
});
