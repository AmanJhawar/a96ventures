'use client'

import React from 'react'
import { motion, HTMLMotionProps } from 'framer-motion'

// Custom Emil Kowalski easing curves
export const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1] // Strong ease-out
export const EASE_IN_OUT: [number, number, number, number] = [0.77, 0, 0.175, 1]

// Stagger parent container
interface StaggerContainerProps extends HTMLMotionProps<'div'> {
  children: React.ReactNode
  staggerDelay?: number
  initialDelay?: number
}

export function StaggerContainer({ 
  children, 
  staggerDelay = 0.05, 
  initialDelay = 0.05,
  ...props 
}: StaggerContainerProps) {
  const variants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: staggerDelay,
        delayChildren: initialDelay,
      }
    }
  }

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={variants}
      {...props}
    >
      {children}
    </motion.div>
  )
}

// Fade in & Slide up item
interface FadeInUpProps extends HTMLMotionProps<'div'> {
  children: React.ReactNode
  yOffset?: number
  duration?: number
}

export function FadeInUp({ 
  children, 
  yOffset = 16, 
  duration = 0.4,
  ...props 
}: FadeInUpProps) {
  const variants = {
    hidden: { 
      opacity: 0, 
      y: yOffset 
    },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { 
        duration, 
        ease: EASE_OUT 
      }
    }
  }

  return (
    <motion.div
      variants={variants}
      {...props}
    >
      {children}
    </motion.div>
  )
}
