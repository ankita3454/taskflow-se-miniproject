pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
    }

    environment {
        CI = 'true'
        DATABASE_URL = 'postgresql://build:build@localhost:5432/build'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Check tools') {
            steps {
                sh '''
                    node --version
                    npm --version
                    docker --version
                '''
            }
        }

        stage('Frontend lint and build') {
            steps {
                dir('frontend') {
                    sh 'npm ci'
                    sh 'npm run lint'

                    withEnv(['VITE_API_BASE_URL=/api/v1']) {
                        sh 'npm run build'
                    }
                }
            }
        }

        stage('Backend foundation checks') {
            steps {
                dir('backend') {
                    sh '''
                        npm ci
                        node --check src/app.js
                        node --check src/server.js
                        node --check src/repositories/prisma.js
                        node --check scripts/check-db.js
                        npx prisma validate
                        npx prisma generate
                    '''
                }
            }
        }

        stage('Build Docker images') {
            steps {
                sh '''
                    docker build -t taskflow-backend:jenkins ./backend
                    docker build -t taskflow-frontend:jenkins ./frontend
                '''
            }
        }
    }

    post {
        success {
            echo 'Foundation checks and Docker image builds passed.'
        }

        failure {
            echo 'Pipeline failed. Inspect the failed stage logs.'
        }
    }
}