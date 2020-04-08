export BASE_REPO=$1
export SERVICE_NAMESPACE=$2
export AWS_SERVICE_NAME=$3
if ["$1" = ""]; then
        echo "Usage: source build.sh cluster-name service-name ecs-repo-name"
        exit 1
else
        echo "Building image..."
        docker build \
                --build-arg FRONTEND_HOST_NAME=${FRONTEND_HOST_NAME} \
                --build-arg FRONTEND_HOST_PROTOCOL=${FRONTEND_HOST_PROTOCOL} \
                --build-arg SECRET_STRING=${SECRET_STRING} \
                -f Dockerfile \
                -t $BASE_REPO/$SERVICE_NAMESPACE/$AWS_SERVICE_NAME:${CI_COMMIT_SHA} \
                -t $BASE_REPO/$SERVICE_NAMESPACE/$AWS_SERVICE_NAME:master \
                .

        echo "PUSHING IMAGE"
        echo "REPO NAME = " + $BASE_REPO/$SERVICE_NAMESPACE/$AWS_SERVICE_NAME
        # Install AWS CLI
        echo " INSTALLING AWS CLI "
        apk add --update python python-dev py-pip jq
        pip install awscli --upgrade

        echo "CONFIGURING AWS"
        # Configure AWS Access Key ID
        aws configure set aws_access_key_id $AWS_ACCESS_KEY_ID --profile default

        # Configure AWS Secret Access Key
        aws configure set aws_secret_access_key $AWS_SECRET_ACCESS_KEY --profile default

        # Configure AWS default region
        aws configure set region $AWS_DEFAULT_REGION --profile default

        echo "LOGGING IN AWS ECR"
        # Log into Amazon ECR
        # aws ecr get-login returns a login command w/ a temp token
        LOGIN_COMMAND=$(aws ecr get-login --no-include-email --region $AWS_DEFAULT_REGION)

        # CREATE ECR repo if it doesnt exist
        aws ecr describe-repositories --repository-names $SERVICE_NAMESPACE/${AWS_SERVICE_NAME} || aws ecr create-repository --repository-name ${REPO_NAME}

        # save it to an env var & use that env var to login
        $LOGIN_COMMAND
        echo "Pushing to " + $BASE_REPO/$SERVICE_NAMESPACE/$AWS_SERVICE_NAME:${CI_COMMIT_SHA}
        docker push $BASE_REPO/$SERVICE_NAMESPACE/$AWS_SERVICE_NAME:${CI_COMMIT_SHA}
        echo "Pushing to " + $BASE_REPO/$SERVICE_NAMESPACE/$AWS_SERVICE_NAME:master
        docker push $BASE_REPO/$SERVICE_NAMESPACE/$AWS_SERVICE_NAME:master
fi
#         -t $CI_REGISTRY_IMAGE:$CI_COMMIT_REF_NAME \
#         .
# docker push $CI_REGISTRY_IMAGE:$CI_COMMIT_REF_NAME