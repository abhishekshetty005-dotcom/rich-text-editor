
pipeline {
    agent any

    options {
        skipDefaultCheckout(true)
        disableConcurrentBuilds()
        timestamps()
    }

    environment {
        APP_NAME = 'rich-text-editor'
        IMAGE_NAME = 'rich-text-editor:latest'
        APP_PORT = '3000'
    }

    stages {
        stage('Checkout') {
            steps {
                git branch: 'main',
                    url: 'https://github.com/abhishekshetty005-dotcom/rich-text-editor.git'
            }
        }

        stage('Validate') {
            steps {
                sh '''
                    set -eu
					whoami
                    test -f Dockerfile
                    test -f docker-compose.yml
                    docker --version
                    docker compose version
                    docker info >/dev/null
                '''
            }
        }

        stage('Build') {
            steps {
                sh '''
                    set -eu
                    docker build -t "$IMAGE_NAME" .
                '''
            }
        }

        stage('Deploy') {
            steps {
                sh '''
                    set -eu

                    # Create a persistent volume for application documents
                    docker volume create editor-data

                    # Remove the previous container, if one exists
                    docker rm -f "$APP_NAME" || true

                    # Start the newly built version
                    docker run -d \
                        --name "$APP_NAME" \
                        --restart unless-stopped \
                        -p "$APP_PORT:3000" \
                        -v editor-data:/data \
                        "$IMAGE_NAME"

                    # Wait for the application to start
                    for i in $(seq 1 30); do
                        if curl -fsS \
                            http://127.0.0.1:$APP_PORT/api/docs \
                            >/dev/null; then
                            echo "Application is responding."
                            exit 0
                        fi
                        sleep 2
                    done

                    echo "Application failed its health check."
                    docker logs "$APP_NAME" || true
                    exit 1
                '''
            }
        }
    }

    post {
        success {
            echo 'Deployment successful: http://<UBUNTU_AGENT_IP>:3000'
        }
        failure {
            echo 'Pipeline failed. Review the stage logs and container logs.'
        }
    }
}
