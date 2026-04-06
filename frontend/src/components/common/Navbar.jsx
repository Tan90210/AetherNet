import { Link, useLocation } from 'react-router-dom';
import {
    SignedIn,
    SignedOut,
    SignInButton,
    SignUpButton,
    UserButton,
    useUser,
} from '@clerk/clerk-react';
import { Brain, ShoppingBag, LayoutDashboard, Menu, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import styles from './Navbar.module.css';

export default function Navbar() {
    const { user }=useUser();
    const [scrolled, setScrolled]=useState(false);
    const [menuOpen, setMenuOpen]=useState(false);
    const location=useLocation();

    useEffect(() => {
        const onScroll=() => setScrolled(window.scrollY>20);
        window.addEventListener('scroll', onScroll);
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    useEffect(() => setMenuOpen(false), [location]);

    const navLinks=[
        { to: '/', label: 'Home', icon: <Brain size={15} /> },
        { to: '/marketplace', label: 'Marketplace', icon: <ShoppingBag size={15} /> },
        { to: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={15} /> },
    ];

    return (
        <nav className={`${styles.navbar} ${scrolled ? styles.scrolled : ''}`}>
            <div className={styles.inner}>
                {/* Logo */}
                <Link to="/" className={styles.logo}>
                    <div className={styles.logoIcon}>
                        <Brain size={18} />
                    </div>
                    <span className={styles.logoText}>ModelMesh</span>
                </Link>

                {/* Desktop Nav */}
                <ul className={styles.navLinks}>
                    {navLinks.map(({ to, label, icon }) => (
                        <li key={to}>
                            <Link
                                to={to}
                                className={`${styles.navLink} ${location.pathname=== to ? styles.active : ''}`}
                            >
                                {icon}
                                {label}
                            </Link>
                        </li>
                    ))}
                </ul>

                {/* Auth actions */}
                <div className={styles.actions}>
                    <SignedOut>
                        <SignInButton mode="modal">
                            <button className="btn btn-secondary btn-sm">Sign In</button>
                        </SignInButton>
                        <SignUpButton mode="modal">
                            <button className="btn btn-primary btn-sm">Get Started</button>
                        </SignUpButton>
                    </SignedOut>

                    <SignedIn>
                        <div className={styles.userMenu}>
                            {user && (
                                <span className={styles.username}>
                                    {user.username || user.firstName || user.primaryEmailAddress?.emailAddress?.split('@')[0]}
                                </span>
                            )}
                            {/* Clerk's avatar + dropdown (sign-out, manage account, etc.) */}
                            <UserButton
                                afterSignOutUrl="/"
                                appearance={{
                                    elements: {
                                        avatarBox: {
                                            width: 32, height: 32,
                                            borderRadius: '50%',
                                            border: '2px solid rgba(108,99,255,0.5)',
                                        },
                                    },
                                }}
                            />
                        </div>
                    </SignedIn>
                </div>

                {/* Mobile hamburger */}
                <button className={styles.burger} onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
                    {menuOpen ? <X size={20} /> : <Menu size={20} />}
                </button>
            </div>

            {/* Mobile menu */}
            {menuOpen && (
                <div className={styles.mobileMenu}>
                    {navLinks.map(({ to, label, icon }) => (
                        <Link key={to} to={to} className={styles.mobileLink}>
                            {icon} {label}
                        </Link>
                    ))}
                    <div className={styles.mobileDivider} />
                    <SignedOut>
                        <SignInButton mode="modal">
                            <button className="btn btn-secondary btn-sm" style={{ width: '100%' }}>Sign In</button>
                        </SignInButton>
                        <SignUpButton mode="modal">
                            <button className="btn btn-primary btn-sm" style={{ width: '100%', marginTop: 8 }}>Get Started</button>
                        </SignUpButton>
                    </SignedOut>
                    <SignedIn>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
                            <UserButton afterSignOutUrl="/" />
                            <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                                {user?.username || 'My Account'}
                            </span>
                        </div>
                    </SignedIn>
                </div>
            )}
        </nav>
    );
}
